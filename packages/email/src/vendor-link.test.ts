import { describe, expect, it } from 'vitest'
import { createMailer } from './index.ts'
import { PREVIEW_INVITE_COPY } from './templates/staff-invite.tsx'
import type { DeliveryRecord, EmailMessage, MailTransport, SendResult } from './types.ts'

/**
 * Spec 0009 A4: the vendor's link, mailed. Same template as the invitations (see
 * `sendVendorLink`), so what is asserted is what makes it its own mail: the link reaches the
 * vendor in both parts, the delivery is tagged and recorded as `vendor-link`, and the token --
 * which opens the vendor's view until it expires -- never reaches `mail_deliveries`.
 */

function fakeTransport(result: SendResult = { ok: true, messageId: 'ses-v' }) {
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

const URL = 'https://app.guestnote.be/vendor/tok_vendor-42'
const COPY = { ...PREVIEW_INVITE_COPY, subject: 'Studio Wit: uw planning voor Lien & Tom' }
const INPUT = { to: 'info@traiteur.be', locale: 'fr', url: URL, copy: COPY } as const

describe('createMailer().sendVendorLink', () => {
  it('sends the link as an href and in the text part, under its own tag', async () => {
    const { transport, sent } = fakeTransport()
    const result = await createMailer({ transport }).sendVendorLink(INPUT)

    expect(result).toEqual({ ok: true, messageId: 'ses-v' })
    expect(sent[0]?.to).toBe('info@traiteur.be')
    expect(sent[0]?.subject).toBe(COPY.subject)
    expect(sent[0]?.html).toContain(`href="${URL}"`)
    expect(sent[0]?.text).toContain(URL)
    expect(sent[0]?.html).toMatch(/<html[^>]*lang="fr"/)
    expect(sent[0]?.tags).toEqual({ template: 'vendor-link' })
  })

  it('records the delivery under its own template, without the link', async () => {
    const { transport } = fakeTransport()
    const rows: DeliveryRecord[] = []
    await createMailer({
      transport,
      record: async (entry) => {
        rows.push(entry)
      },
    }).sendVendorLink(INPUT)

    expect(rows).toEqual([
      {
        toEmail: 'info@traiteur.be',
        template: 'vendor-link',
        locale: 'fr',
        providerMessageId: 'ses-v',
        status: 'sent',
        error: null,
      },
    ])
    expect(JSON.stringify(rows)).not.toContain('tok_vendor')
  })

  it('records a failed send and hands the failure back, so the sheet can say so', async () => {
    const { transport } = fakeTransport({ ok: false, failure: 'rejected', detail: 'sandbox' })
    const rows: DeliveryRecord[] = []
    const result = await createMailer({
      transport,
      record: async (entry) => {
        rows.push(entry)
      },
    }).sendVendorLink(INPUT)

    expect(result.ok).toBe(false)
    expect(rows[0]?.status).toBe('failed')
    expect(rows[0]?.error).toBe('sandbox')
  })
})
