import { describe, expect, it } from 'vitest'
import { createMailer } from './index.ts'
import { PREVIEW_INVITE_COPY } from './templates/staff-invite.tsx'
import type { DeliveryRecord, EmailMessage, MailTransport, SendResult } from './types.ts'

/**
 * The staff invitation, through the same mailer as the sign-in code.
 *
 * It differs from `sendSignInCode` in the two ways that matter: it carries a link, and the
 * link must not reach `mail_deliveries`, because the token in it is a credential.
 */

function fakeTransport(result: SendResult = { ok: true, messageId: 'ses-1' }) {
  const sent: EmailMessage[] = []
  const transport: MailTransport = {
    name: 'console',
    async send(message) {
      sent.push(message)
      return result
    },
  }
  return { transport, sent }
}

const URL = 'https://app.guestnote.be/invite/tok_abc-123'
const INPUT = {
  to: 'els@studiowit.be',
  locale: 'nl',
  url: URL,
  copy: PREVIEW_INVITE_COPY,
} as const

describe('createMailer().sendStaffInvite', () => {
  it('puts the link in the HTML as an href and in the text part, and tags the template', async () => {
    const { transport, sent } = fakeTransport()
    const result = await createMailer({ transport }).sendStaffInvite(INPUT)

    expect(result).toEqual({ ok: true, messageId: 'ses-1' })
    expect(sent[0]?.to).toBe('els@studiowit.be')
    expect(sent[0]?.subject).toBe(PREVIEW_INVITE_COPY.subject)
    expect(sent[0]?.html).toContain(`href="${URL}"`)
    expect(sent[0]?.text).toContain(URL)
    expect(sent[0]?.tags).toEqual({ template: 'staff-invite' })
  })

  it('announces the recipient language on the document', async () => {
    const { transport, sent } = fakeTransport()
    await createMailer({ transport }).sendStaffInvite({ ...INPUT, locale: 'fr' })
    expect(sent[0]?.html).toMatch(/<html[^>]*lang="fr"/)
  })

  /**
   * The token is the whole credential, so it must never be written to the diagnostic table.
   */
  it('records the delivery without the link', async () => {
    const { transport } = fakeTransport({ ok: true, messageId: 'ses-9' })
    const rows: DeliveryRecord[] = []
    await createMailer({
      transport,
      record: async (entry) => {
        rows.push(entry)
      },
    }).sendStaffInvite(INPUT)

    expect(rows).toEqual([
      {
        toEmail: 'els@studiowit.be',
        template: 'staff-invite',
        locale: 'nl',
        providerMessageId: 'ses-9',
        status: 'sent',
        error: null,
      },
    ])
    expect(JSON.stringify(rows)).not.toContain('tok_abc')
  })

  it('records a failed send and hands the failure back so the caller can undo the invite', async () => {
    const { transport } = fakeTransport({ ok: false, failure: 'rejected', detail: 'nope' })
    const rows: DeliveryRecord[] = []
    const result = await createMailer({
      transport,
      record: async (entry) => {
        rows.push(entry)
      },
    }).sendStaffInvite(INPUT)

    expect(result.ok).toBe(false)
    expect(rows[0]?.status).toBe('failed')
    expect(rows[0]?.error).toBe('nope')
  })
})
