import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * "Report a problem". Mocked: the principal, `next/headers`, `next-intl` and the inbox. These
 * tests are about who may send, what is refused before anything leaves, and what context rides
 * along -- not about Sentry, which `lib/observability.test.ts` fences off.
 */
const reportFeedback = vi.fn()
const currentSession = vi.fn()
const currentMemberships = vi.fn()
const currentOrgId = vi.fn()

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': 'Mozilla/5.0 (iPhone)' }),
}))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'nl' }))
vi.mock('../../../../lib/observability.ts', () => ({
  reportFeedback: (...a: unknown[]) => reportFeedback(...a),
}))
vi.mock('../../../../lib/principal.ts', () => ({
  currentSession: () => currentSession(),
  currentMemberships: () => currentMemberships(),
  currentOrgId: () => currentOrgId(),
}))

const ORG = '019a0000-0000-7000-8000-00000000000a'
const WEDDING = '019a0000-0000-7000-8000-0000000000cc'

let sendReport: typeof import('./actions.ts').sendReport

beforeEach(async () => {
  vi.clearAllMocks()
  // A fresh module per case: the rate-limit window lives in module state.
  vi.resetModules()
  ;({ sendReport } = await import('./actions.ts'))
  currentSession.mockResolvedValue({ userId: 'u1', email: 'ilse@studiowit.be', name: 'Ilse' })
  currentMemberships.mockResolvedValue({
    userId: 'u1',
    orgs: [{ orgId: ORG, role: 'member' }],
    weddings: [],
  })
  currentOrgId.mockResolvedValue(ORG)
  reportFeedback.mockResolvedValue(true)
})

function form(fields: Record<string, string | File>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('sendReport', () => {
  it('sends the category, the text and the context, with no query string on the page', async () => {
    const out = await sendReport(
      form({
        category: 'idea',
        message: '  Kan de checklist sorteren?  ',
        page: `/weddings/${WEDDING}/checklist?task=1`,
      }),
    )

    expect(out).toEqual({ ok: true })
    expect(reportFeedback).toHaveBeenCalledWith({
      category: 'idea',
      message: 'Kan de checklist sorteren?',
      name: 'Ilse',
      email: 'ilse@studiowit.be',
      tags: {
        page: `/weddings/${WEDDING}/checklist`,
        orgId: ORG,
        weddingId: WEDDING,
        locale: 'nl',
        userAgent: 'Mozilla/5.0 (iPhone)',
      },
      attachment: undefined,
    })
  })

  it('refuses someone who is staff nowhere -- a couple goes through their planner', async () => {
    currentMemberships.mockResolvedValue({
      userId: 'u1',
      orgs: [],
      weddings: [{ weddingId: WEDDING, role: 'couple' }],
    })
    expect(await sendReport(form({ message: 'x' }))).toEqual({ ok: false, reason: 'forbidden' })
    expect(reportFeedback).not.toHaveBeenCalled()
  })

  it('refuses with no session', async () => {
    currentSession.mockResolvedValue(null)
    expect(await sendReport(form({ message: 'x' }))).toEqual({ ok: false, reason: 'forbidden' })
  })

  it('refuses a blank message and an overlong one before sending', async () => {
    expect(await sendReport(form({ message: '   ' }))).toEqual({ ok: false, reason: 'empty' })
    expect(await sendReport(form({ message: 'a'.repeat(4001) }))).toEqual({
      ok: false,
      reason: 'tooLong',
    })
    expect(reportFeedback).not.toHaveBeenCalled()
  })

  it('falls back to bug for a category it does not know', async () => {
    await sendReport(form({ category: 'rant', message: 'x' }))
    expect(reportFeedback.mock.calls[0]?.[0].category).toBe('bug')
  })

  it('attaches an image and refuses anything else, or anything over the cap', async () => {
    const jpeg = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' })
    await sendReport(form({ message: 'x', screenshot: jpeg }))
    expect(reportFeedback.mock.calls[0]?.[0].attachment).toEqual({
      filename: 'screenshot.jpeg',
      contentType: 'image/jpeg',
      data: new Uint8Array([1, 2, 3]),
    })

    const html = new File(['<script>'], 'a.html', { type: 'text/html' })
    expect(await sendReport(form({ message: 'x', screenshot: html }))).toEqual({
      ok: false,
      reason: 'badScreenshot',
    })
    const huge = new File([new Uint8Array(900 * 1024 + 1)], 'b.jpg', { type: 'image/jpeg' })
    expect(await sendReport(form({ message: 'x', screenshot: huge }))).toEqual({
      ok: false,
      reason: 'badScreenshot',
    })
  })

  it('allows five an hour and refuses the sixth', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await sendReport(form({ message: `r${i}` }))).toEqual({ ok: true })
    }
    expect(await sendReport(form({ message: 'r5' }))).toEqual({ ok: false, reason: 'rateLimited' })
    expect(reportFeedback).toHaveBeenCalledTimes(5)
  })

  it('refuses without an org to file it under', async () => {
    currentOrgId.mockResolvedValue(null)
    expect(await sendReport(form({ message: 'x' }))).toEqual({ ok: false, reason: 'forbidden' })
    expect(reportFeedback).not.toHaveBeenCalled()
  })

  it('accepts exactly the caps -- the browser allows these, so the server must too', async () => {
    const atCap = new File([new Uint8Array(900 * 1024)], 'a.jpg', { type: 'image/jpeg' })
    expect(await sendReport(form({ message: 'a'.repeat(4000), screenshot: atCap }))).toEqual({
      ok: true,
    })
    expect(reportFeedback.mock.calls[0]?.[0].attachment?.data.byteLength).toBe(900 * 1024)
  })

  it('counts a CRLF line break as one character, as the textarea did', async () => {
    const text = `${'a'.repeat(1999)}\r\n${'b'.repeat(2000)}`
    expect(await sendReport(form({ message: text }))).toEqual({ ok: true })
    expect(reportFeedback.mock.calls[0]?.[0].message).toBe(text.replace('\r\n', '\n'))
  })

  it('refuses an SVG screenshot -- an image type that can carry script', async () => {
    const svg = new File(['<svg onload="x()"/>'], 'a.svg', { type: 'image/svg+xml' })
    expect(await sendReport(form({ message: 'x', screenshot: svg }))).toEqual({
      ok: false,
      reason: 'badScreenshot',
    })
  })

  it('tags an unparseable page as unknown, clamps a long one, and names no wedding for a bad id', async () => {
    await sendReport(form({ message: 'x', page: 'https://evil.example/x' }))
    expect(reportFeedback.mock.calls[0]?.[0].tags.page).toBe('unknown')

    await sendReport(form({ message: 'x', page: `/${'a'.repeat(300)}` }))
    expect(reportFeedback.mock.calls[1]?.[0].tags.page).toHaveLength(200)

    await sendReport(form({ message: 'x', page: '/weddings/abc/budget' }))
    expect(reportFeedback.mock.calls[2]?.[0].tags.weddingId).toBe('none')
  })

  it('names the reporter by email when they have no name yet', async () => {
    currentSession.mockResolvedValue({ userId: 'u1', email: 'ilse@studiowit.be', name: null })
    await sendReport(form({ message: 'x' }))
    expect(reportFeedback.mock.calls[0]?.[0].name).toBe('ilse@studiowit.be')
  })

  it('does not spend the budget on reports that never arrived, or that were refused', async () => {
    reportFeedback.mockResolvedValue(false)
    for (let i = 0; i < 5; i++) await sendReport(form({ message: `failed ${i}` }))
    for (let i = 0; i < 5; i++) await sendReport(form({ message: '   ' }))
    reportFeedback.mockResolvedValue(true)
    expect(await sendReport(form({ message: 'this one arrives' }))).toEqual({ ok: true })
  })

  it('counts per user, and forgets a send after an hour', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    for (let i = 0; i < 5; i++) await sendReport(form({ message: `r${i}` }))
    expect(await sendReport(form({ message: 'r5' }))).toEqual({ ok: false, reason: 'rateLimited' })

    currentSession.mockResolvedValue({ userId: 'u2', email: 'els@studiowit.be', name: 'Els' })
    expect(await sendReport(form({ message: 'someone else' }))).toEqual({ ok: true })

    currentSession.mockResolvedValue({ userId: 'u1', email: 'ilse@studiowit.be', name: 'Ilse' })
    now.mockReturnValue(1_000_000 + 60 * 60 * 1000 + 1)
    expect(await sendReport(form({ message: 'an hour later' }))).toEqual({ ok: true })
    now.mockRestore()
  })

  it('says unavailable rather than thanking the planner when nothing was sent', async () => {
    reportFeedback.mockResolvedValue(false)
    expect(await sendReport(form({ message: 'x' }))).toEqual({ ok: false, reason: 'unavailable' })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportFeedback.mockRejectedValue(new Error('network'))
    expect(await sendReport(form({ message: 'y' }))).toEqual({ ok: false, reason: 'unavailable' })
    // Logged, so CloudWatch says why every report is failing.
    expect(log).toHaveBeenCalledWith('[report] feedback not delivered', expect.any(Error))
    log.mockRestore()
  })
})
