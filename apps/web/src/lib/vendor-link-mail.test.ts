import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The catalogue side of the vendor-link mail (spec 0009 A4): which words, in which language. */
const sendVendorLink = vi.fn()
vi.mock('./mailer.ts', () => ({ getMailer: () => ({ sendVendorLink }) }))
vi.mock('./app-url.ts', () => ({
  appVendorLinkUrl: (t: string) => `https://app.test/vendor/${t}`,
}))

const { sendVendorLinkMail } = await import('./vendor-link-mail.ts')

const BASE = {
  to: 'info@traiteur.be',
  token: 'tok',
  studio: 'Studio Wit',
  couple: 'Lien & Tom',
  expiresAt: '2026-11-01T10:00:00.000Z',
} as const

beforeEach(() => {
  vi.clearAllMocks()
  sendVendorLink.mockResolvedValue({ ok: true, messageId: 'm' })
})

describe('sendVendorLinkMail', () => {
  it.each([
    ['nl', '1 november 2026'],
    ['en', 'November 1, 2026'],
    ['fr', '1 novembre 2026'],
  ] as const)(
    '%s: names the studio, the couple and the expiry day in the wedding language',
    async (locale, day) => {
      await sendVendorLinkMail({ ...BASE, locale })
      const call = sendVendorLink.mock.calls[0]?.[0]
      expect(call.to).toBe('info@traiteur.be')
      expect(call.locale).toBe(locale)
      expect(call.url).toBe('https://app.test/vendor/tok')
      expect(call.copy.subject).toContain('Studio Wit')
      expect(call.copy.subject).toContain('Lien & Tom')
      expect(call.copy.intro).toContain('Studio Wit')
      expect(call.copy.footer).toContain('Studio Wit')
      expect(call.copy.expiry).toContain(day)
      // A missing key would render as its own path.
      for (const value of Object.values(call.copy)) expect(String(value)).not.toMatch(/vendorLink/)
    },
  )

  it('falls back to Dutch for a locale the catalogues do not know', async () => {
    await sendVendorLinkMail({ ...BASE, locale: 'de' })
    const call = sendVendorLink.mock.calls[0]?.[0]
    expect(call.locale).toBe('nl')
    expect(call.copy.expiry).toContain('1 november 2026')
  })
})
