import { describe, expect, it } from 'vitest'
import { createMailer } from './index.ts'
import { PREVIEW_TRIAL_REMINDER_COPY } from './templates/trial-reminder.tsx'
import type { DeliveryRecord, EmailMessage, MailTransport } from './types.ts'

/** The trial reminder (spec 0005), through the same mailer as the other two templates. */
function fakeTransport() {
  const sent: EmailMessage[] = []
  const transport: MailTransport = {
    name: 'console',
    async send(message) {
      sent.push(message)
      return { ok: true, messageId: 'ses-7' }
    },
  }
  return { transport, sent }
}

const URL = 'https://app.guestnote.be/billing'

describe('createMailer().sendTrialReminder', () => {
  it('links to Billing, says what happens after, and tags the template', async () => {
    const { transport, sent } = fakeTransport()
    const rows: DeliveryRecord[] = []
    const result = await createMailer({
      transport,
      record: async (e) => {
        rows.push(e)
      },
    }).sendTrialReminder({
      to: 'ilse@wit.be',
      locale: 'nl',
      url: URL,
      copy: PREVIEW_TRIAL_REMINDER_COPY,
    })

    expect(result).toEqual({ ok: true, messageId: 'ses-7' })
    expect(sent[0]?.subject).toBe(PREVIEW_TRIAL_REMINDER_COPY.subject)
    expect(sent[0]?.html).toContain(`href="${URL}"`)
    expect(sent[0]?.text).toContain(PREVIEW_TRIAL_REMINDER_COPY.after)
    expect(sent[0]?.tags).toEqual({ template: 'trial-reminder' })
    expect(rows).toEqual([
      {
        toEmail: 'ilse@wit.be',
        template: 'trial-reminder',
        locale: 'nl',
        providerMessageId: 'ses-7',
        status: 'sent',
        error: null,
      },
    ])
  })
})
