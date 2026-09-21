import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The catalogue side of the staff invitation: which words go to the mailer, in which language. */
const sendStaffInvite = vi.fn()
vi.mock('./mailer.ts', () => ({ getMailer: () => ({ sendStaffInvite }) }))
vi.mock('./app-url.ts', () => ({ appInviteUrl: (t: string) => `https://app.test/invite/${t}` }))

const { sendStaffInviteMail } = await import('./invite-mail.ts')

const BASE = { to: 'els@studiowit.be', token: 'tok', inviter: 'Ilse', org: 'Studio Wit' } as const

beforeEach(() => {
  vi.clearAllMocks()
  sendStaffInvite.mockResolvedValue({ ok: true, messageId: 'm' })
})

describe('sendStaffInviteMail', () => {
  it.each([
    ['nl', 'beheerder', '7 dagen'],
    ['en', 'admin', '7 days'],
    ['fr', 'administrateur', '7 jours'],
  ] as const)(
    '%s: names inviter, org, role and expiry in the recipient language',
    async (locale, roleWord, days) => {
      await sendStaffInviteMail({ ...BASE, locale, role: 'admin' })
      const call = sendStaffInvite.mock.calls[0]?.[0]
      expect(call.locale).toBe(locale)
      expect(call.url).toBe('https://app.test/invite/tok')
      expect(call.copy.subject).toContain('Ilse')
      expect(call.copy.subject).toContain('Studio Wit')
      expect(call.copy.intro).toContain(roleWord)
      expect(call.copy.expiry).toContain(days)
      // A missing key would render as its own path.
      for (const value of Object.values(call.copy)) expect(String(value)).not.toMatch(/staffInvite/)
    },
  )

  it('uses the member word for a member', async () => {
    await sendStaffInviteMail({ ...BASE, locale: 'en', role: 'member' })
    expect(sendStaffInvite.mock.calls[0]?.[0].copy.intro).toContain('team member')
  })

  it('falls back to Dutch for a locale the cookie made up', async () => {
    await sendStaffInviteMail({ ...BASE, locale: 'xx-evil', role: 'member' })
    expect(sendStaffInvite.mock.calls[0]?.[0].locale).toBe('nl')
  })
})
