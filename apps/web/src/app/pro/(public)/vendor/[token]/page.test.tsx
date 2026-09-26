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
    },
  ],
  plannerNote: 'Arrive by 14:00.',
}

beforeEach(() => {
  vi.clearAllMocks()
  resolveVendorLinkByHash.mockResolvedValue(LOOKUP)
  getVendorLinkView.mockResolvedValue(VIEW)
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
