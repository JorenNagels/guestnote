import { describe, expect, it } from 'vitest'
import { createMailer } from './index.ts'
import { PREVIEW_COPY } from './templates/sign-in-code.tsx'
import type { DeliveryRecord, EmailMessage, MailTransport, SendResult } from './types.ts'

/**
 * The mailer, with both of its collaborators faked.
 *
 * The interesting behaviour is not the render -- `render.test.ts` covers that -- but the
 * contract around it: what the transport is handed, what gets recorded, and what happens when
 * recording fails.
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

const INPUT = {
  to: 'ilse@studiowit.be',
  locale: 'nl',
  code: '123456',
  copy: PREVIEW_COPY,
} as const

describe('createMailer().sendSignInCode', () => {
  it('hands the transport a rendered message with the catalogue subject', async () => {
    const { transport, sent } = fakeTransport()
    const result = await createMailer({ transport }).sendSignInCode(INPUT)

    expect(result).toEqual({ ok: true, messageId: 'ses-1' })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe('ilse@studiowit.be')
    // The subject comes from the catalogue, not from string-building here. If that ever
    // changes, the code stops appearing first and iOS loses its autofill suggestion.
    expect(sent[0]?.subject).toBe(PREVIEW_COPY.subject)
    expect(sent[0]?.html).toContain('123456')
    expect(sent[0]?.text).toContain('123456')
    expect(sent[0]?.tags).toEqual({ template: 'sign-in-code' })
  })

  it('records a successful send with the provider id', async () => {
    const { transport } = fakeTransport({ ok: true, messageId: 'ses-42' })
    const rows: DeliveryRecord[] = []
    await createMailer({
      transport,
      record: async (entry) => {
        rows.push(entry)
      },
    }).sendSignInCode(INPUT)

    expect(rows).toEqual([
      {
        toEmail: 'ilse@studiowit.be',
        template: 'sign-in-code',
        locale: 'nl',
        providerMessageId: 'ses-42',
        status: 'sent',
        error: null,
      },
    ])
  })

  /**
   * A failed send still gets a row. That is the whole point of the log: "no code arrived" is
   * answered by a `failed` row with a reason, and an absent row means the request never
   * reached us at all. Those are different support conversations.
   */
  it('records a failed send with the reason and no provider id', async () => {
    const { transport } = fakeTransport({
      ok: false,
      failure: 'rejected',
      detail: 'MessageRejected: Email address is not verified',
    })
    const rows: DeliveryRecord[] = []
    const result = await createMailer({
      transport,
      record: async (entry) => {
        rows.push(entry)
      },
    }).sendSignInCode(INPUT)

    expect(result.ok).toBe(false)
    expect(rows[0]?.status).toBe('failed')
    expect(rows[0]?.providerMessageId).toBeNull()
    expect(rows[0]?.error).toContain('not verified')
  })

  /**
   * **The assertion that matters most here.** A planner who cannot sign in because an audit
   * insert timed out is a worse outcome than a missing diagnostic row, so the recorder's
   * failure is swallowed. Swallowing is only defensible while something asserts that the send
   * result still gets through.
   */
  it('still returns the send result when recording throws', async () => {
    const { transport } = fakeTransport({ ok: true, messageId: 'ses-7' })
    const result = await createMailer({
      transport,
      record: async () => {
        throw new Error('the pooler is having a moment')
      },
    }).sendSignInCode(INPUT)

    expect(result).toEqual({ ok: true, messageId: 'ses-7' })
  })

  it('works with no recorder at all', async () => {
    const { transport } = fakeTransport()
    await expect(createMailer({ transport }).sendSignInCode(INPUT)).resolves.toEqual({
      ok: true,
      messageId: 'ses-1',
    })
  })
})
