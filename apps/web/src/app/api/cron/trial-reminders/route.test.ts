import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The trial-reminder route: who may call it, and that billing off does nothing at all. The
 * cross-tenant read, the dedupe read and the mail are stubbed -- their own tests are
 * `packages/db/test/studios.test.ts` and `packages/email/src/trial-reminder.test.ts`.
 */
const env: { cronSecret: string | undefined } = { cronSecret: 's3cret' }
const billingMode = vi.fn()
const orgsWithTrialEnding = vi.fn()
const sentSince = vi.fn()
const sendTrialReminderMail = vi.fn()

vi.mock('../../../../env.ts', () => ({ env }))
vi.mock('../../../../lib/billing-mode.ts', () => ({ billingMode: () => billingMode() }))
vi.mock('@guestnote/db/cron', () => ({
  orgsWithTrialEnding: (...a: unknown[]) => orgsWithTrialEnding(...a),
}))
vi.mock('../../../../lib/db.ts', () => ({ getDb: () => ({}) }))
vi.mock('../../../../lib/mailer.ts', () => ({ sentSince: (...a: unknown[]) => sentSince(...a) }))
vi.mock('../../../../lib/trial-reminder-mail.ts', () => ({
  sendTrialReminderMail: (...a: unknown[]) => sendTrialReminderMail(...a),
}))
vi.mock('../../../../lib/observability.ts', () => ({ reportSilentFailure: vi.fn() }))

const { POST } = await import('./route.ts')

const call = (auth?: string) =>
  POST(
    new Request('https://app.guestnote.be/api/cron/trial-reminders', {
      method: 'POST',
      headers: auth === undefined ? {} : { authorization: auth },
    }),
  )

const ORG = {
  orgId: 'o1',
  orgName: 'Studio Wit',
  trialEndsOn: '2027-04-10',
  ownerEmail: 'ilse@wit.be',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  env.cronSecret = 's3cret'
  billingMode.mockReturnValue({ on: true, from: '2027-01-01' })
  orgsWithTrialEnding.mockResolvedValue([ORG])
  sentSince.mockResolvedValue(false)
  sendTrialReminderMail.mockResolvedValue({ ok: true, messageId: 'm' })
})

describe('who may call it', () => {
  it.each([
    ['no header', undefined],
    ['a wrong secret', 'Bearer nope'],
    ['the secret without the scheme', 's3cret'],
    ['a longer secret sharing the prefix', 'Bearer s3cret!'],
  ])('refuses %s with 401 and reads nothing', async (_label, auth) => {
    const res = await call(auth)
    expect(res.status).toBe(401)
    expect(orgsWithTrialEnding).not.toHaveBeenCalled()
  })

  it('refuses everything when CRON_SECRET is unset, even an empty bearer', async () => {
    env.cronSecret = undefined
    for (const auth of ['Bearer ', 'Bearer undefined', 'Bearer s3cret']) {
      expect((await call(auth)).status).toBe(401)
    }
    expect(orgsWithTrialEnding).not.toHaveBeenCalled()
  })
})

describe('with the secret', () => {
  it('does nothing while billing is off: no query, no mail', async () => {
    billingMode.mockReturnValue({ on: false })
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ billing: 'off', sent: 0 })
    expect(orgsWithTrialEnding).not.toHaveBeenCalled()
    expect(sendTrialReminderMail).not.toHaveBeenCalled()
  })

  it('asks for trials ending three Brussels days from now, from the billing start', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 22:30 UTC on 6 April is already the 7th in Brussels, so three days on is the 10th.
    vi.setSystemTime(new Date('2027-04-06T22:30:00Z'))
    const res = await call('Bearer s3cret')
    expect(orgsWithTrialEnding).toHaveBeenCalledWith({}, '2027-04-10', '2027-01-01')
    expect(await res.json()).toEqual({
      ok: true,
      billing: 'on',
      on: '2027-04-10',
      due: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
    })
    expect(sendTrialReminderMail).toHaveBeenCalledWith({
      to: 'ilse@wit.be',
      studio: 'Studio Wit',
      endsOn: '2027-04-10',
    })
  })

  it('sends once: an owner already sent the reminder is skipped', async () => {
    sentSince.mockResolvedValue(true)
    const res = await call('Bearer s3cret')
    expect(await res.json()).toMatchObject({ sent: 0, skipped: 1 })
    expect(sentSince).toHaveBeenCalledWith('ilse@wit.be', 'trial-reminder', expect.any(Date))
    expect(sendTrialReminderMail).not.toHaveBeenCalled()
  })

  it('counts a failed send and carries on with the next org', async () => {
    orgsWithTrialEnding.mockResolvedValue([ORG, { ...ORG, orgId: 'o2', ownerEmail: 'b@b.be' }])
    sendTrialReminderMail
      .mockRejectedValueOnce(new Error('ses down'))
      .mockResolvedValueOnce({ ok: true, messageId: 'm' })
    const res = await call('Bearer s3cret')
    expect(await res.json()).toMatchObject({ due: 2, sent: 1, failed: 1 })
  })
})
