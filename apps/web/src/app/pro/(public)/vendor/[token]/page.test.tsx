import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `/vendor/<token>` -- what it does with a resolved link: `live` renders the vendor's data,
 * everything else (`expired`, `revoked`, unknown) renders the identical `gone` screen.
 *
 * `@guestnote/db` is mocked at the two functions this page calls; `getDb()` is mocked to a
 * sentinel so a call with the wrong "db" argument would show up in `toHaveBeenCalledWith`.
 * `hashBearerToken` is the real module -- it is pure and deterministic, so mocking it
 * would only hide a wrong argument getting through.
 */
const resolveVendorLinkByHash = vi.fn()
const getVendorLinkView = vi.fn()
const logoUrl = vi.fn()
const vendorBoards = vi.fn()
const DB = { marker: 'the-db' }

vi.mock('@guestnote/db', async (orig) => ({
  ...(await orig<typeof import('@guestnote/db')>()),
  resolveVendorLinkByHash: (...a: unknown[]) => resolveVendorLinkByHash(...a),
  getVendorLinkView: (...a: unknown[]) => getVendorLinkView(...a),
}))
vi.mock('../../../../../lib/db.ts', () => ({ getDb: () => DB }))
vi.mock('../../../../../lib/studio-logo.ts', () => ({
  logoUrl: (...a: unknown[]) => logoUrl(...a),
}))
// Spec 0007's shared boards: mocked at the page's own seam. What they hold is
// `moodboards.test.ts`'s (RLS) and `vendor-boards.test.ts`'s (the re-sign door).
vi.mock('../../../../../lib/vendor-boards.ts', () => ({
  vendorBoards: (...a: unknown[]) => vendorBoards(...a),
}))
const refreshBoardImages = vi.fn()
const boardImageDownload = vi.fn()
vi.mock('./actions.ts', () => ({
  refreshBoardImages: (...a: unknown[]) => refreshBoardImages(...a),
  boardImageDownload: (...a: unknown[]) => boardImageDownload(...a),
}))
type VendorActions = { refresh(): Promise<unknown>; download(id: string): Promise<unknown> }
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'nl',
  getTranslations: async () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) => {
        if (!values) return key
        return `${key}:${Object.entries(values)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')}`
      },
      { raw: (key: string) => key },
    ),
}))

const { default: VendorLinkPage } = await import('./page.tsx')

const render = async (token = 'tok') => VendorLinkPage({ params: Promise.resolve({ token }) })

const LOOKUP = {
  orgId: 'org-1',
  weddingId: 'wed-1',
  weddingVendorId: 'wv-1',
  vendorName: 'Traiteur A',
  orgName: 'Studio Wit',
  weddingCoupleDisplayName: 'Anna & Bram',
  weddingDate: '2027-08-14',
  weddingVenue: 'Kasteel Groot',
  weddingHeadcount: 120,
  status: 'live' as const,
  logoKey: null,
}

const VIEW = {
  timeline: [
    {
      id: 'item-1',
      eventLabel: 'Ceremony',
      startsAt: '15:30',
      durationMin: 40,
      title: 'Setup',
      place: 'Chapel',
      vendorName: null,
      isOwn: true,
    },
  ],
  fullDay: false,
  plannerNote: 'Arrive by 14:00.',
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveVendorLinkByHash.mockResolvedValue(LOOKUP)
  getVendorLinkView.mockResolvedValue(VIEW)
  vendorBoards.mockResolvedValue([])
  logoUrl.mockImplementation(async (_org: string, key: string | null) =>
    key ? `https://get.example/${key}` : null,
  )
})

describe('a live link', () => {
  it('resolves the token through getDb(), and builds a link principal from the lookup', async () => {
    await render('the-token')

    expect(resolveVendorLinkByHash).toHaveBeenCalledWith(DB, expect.any(String))
    // Never the plaintext token itself -- only its hash reaches the repo.
    expect(resolveVendorLinkByHash.mock.calls[0]?.[1]).not.toBe('the-token')

    expect(getVendorLinkView).toHaveBeenCalledWith(DB, {
      kind: 'link',
      orgId: LOOKUP.orgId,
      weddingId: LOOKUP.weddingId,
      weddingVendorId: LOOKUP.weddingVendorId,
    })
  })

  it('renders the vendor and wedding identity, and the timeline', async () => {
    const el = (await render()) as { props: { children: unknown } }
    const html = JSON.stringify(el)
    expect(html).toContain('Traiteur A')
    expect(html).toContain('Studio Wit')
    expect(html).toContain('Setup')
  })

  it('does not render "what the planner needs" when there is no note', async () => {
    getVendorLinkView.mockResolvedValue({ ...VIEW, plannerNote: null })
    const el = await render()
    expect(JSON.stringify(el)).not.toContain('plannerNeedsTitle')
  })
})

/**
 * Spec 0005: the studio's logo in the header. `logoUrl` is mocked at its seam; the rule pinned
 * is that it is signed with the org the LOOKUP resolved -- the only org this link speaks for --
 * and handed to the header's mark, which draws the monogram when there is none.
 */
describe('the studio logo in the header', () => {
  it('signs the logo key with the lookup org and draws it', async () => {
    resolveVendorLinkByHash.mockResolvedValue({ ...LOOKUP, logoKey: 'org-1/brand/logo' })
    const html = JSON.stringify(await render())
    expect(logoUrl).toHaveBeenCalledWith('org-1', 'org-1/brand/logo')
    expect(html).toContain('"logoUrl":"https://get.example/org-1/brand/logo"')
  })

  it('passes no logo when the studio has none', async () => {
    const html = JSON.stringify(await render())
    expect(logoUrl).toHaveBeenCalledWith('org-1', null)
    expect(html).toContain('"logoUrl":null')
    expect(html).toContain('"name":"Studio Wit"')
  })

  it('signs nothing for a link that is not live', async () => {
    resolveVendorLinkByHash.mockResolvedValue({ ...LOOKUP, status: 'revoked' })
    await render()
    expect(logoUrl).not.toHaveBeenCalled()
  })
})

/** Spec 0007: the whole day, and the boards shared with this vendor. */
describe('the full day and the shared boards', () => {
  it("titles the whole day, and names another vendor on their row but not on the vendor's own", async () => {
    getVendorLinkView.mockResolvedValue({
      ...VIEW,
      fullDay: true,
      timeline: [
        { ...VIEW.timeline[0], vendorName: 'Traiteur A', isOwn: true },
        {
          ...VIEW.timeline[0],
          id: 'item-2',
          title: 'First dance',
          vendorName: 'DJ Tom',
          isOwn: false,
        },
      ],
    })
    const html = JSON.stringify(await render())
    expect(html).toContain('timelineFullTitle')
    expect(html).not.toContain('"timelineTitle"')
    expect(html).toContain('DJ Tom')
    // The vendor's own name is already the page's heading; it is not repeated on their rows.
    expect(html.match(/Traiteur A/g)).toHaveLength(1)
  })

  it('says "nothing planned" for the whole day over an empty sheet, not "nothing for you"', async () => {
    getVendorLinkView.mockResolvedValue({ ...VIEW, fullDay: true, timeline: [] })
    const html = JSON.stringify(await render())
    expect(html).toContain('fullEmpty')
    expect(html).not.toContain('timelineEmpty')
  })

  it('binds the page token into both board actions', async () => {
    vendorBoards.mockResolvedValue([{ id: 'b1', name: 'Fotograaf', images: [] }])
    const el = await render('the-token')
    const find = (node: unknown): { props: { actions: VendorActions } } | null => {
      if (!node || typeof node !== 'object') return null
      const n = node as { props?: { actions?: unknown; children?: unknown } }
      if (n.props?.actions && 'refresh' in (n.props.actions as object)) {
        return n as { props: { actions: VendorActions } }
      }
      const kids = n.props?.children
      for (const k of Array.isArray(kids) ? kids : [kids]) {
        const hit = find(k)
        if (hit) return hit
      }
      return null
    }
    const boards = find(el)
    await boards?.props.actions.refresh()
    await boards?.props.actions.download('f1')
    expect(refreshBoardImages).toHaveBeenCalledWith('the-token')
    expect(boardImageDownload).toHaveBeenCalledWith('the-token', 'f1')
  })

  it('reads the boards for the lookup, and renders none when nothing is shared', async () => {
    const html = JSON.stringify(await render())
    expect(vendorBoards).toHaveBeenCalledWith(LOOKUP)
    expect(html).not.toContain('"boards"')
  })

  it('hands shared boards and a token-bound refresh to the board component', async () => {
    vendorBoards.mockResolvedValue([
      { id: 'b1', name: 'Fotograaf', images: [{ id: 'f1', name: 'Golden hour', url: 'u' }] },
    ])
    const html = JSON.stringify(await render())
    expect(html).toContain('"name":"Fotograaf"')
  })

  it('reads no board for a link that is not live', async () => {
    resolveVendorLinkByHash.mockResolvedValue({ ...LOOKUP, status: 'expired' })
    await render()
    expect(vendorBoards).not.toHaveBeenCalled()
  })
})

describe('anything other than live', () => {
  it.each(['expired', 'revoked'] as const)(
    'renders the same "gone" screen for %s',
    async (status) => {
      resolveVendorLinkByHash.mockResolvedValue({ ...LOOKUP, status })
      const el = await render()
      expect(JSON.stringify(el)).toContain('gone.title')
      expect(getVendorLinkView).not.toHaveBeenCalled()
    },
  )

  it('an unknown token (null lookup) renders the identical screen, not a 500', async () => {
    resolveVendorLinkByHash.mockResolvedValue(null)
    const el = await render()
    expect(JSON.stringify(el)).toContain('gone.title')
    expect(getVendorLinkView).not.toHaveBeenCalled()
  })
})
