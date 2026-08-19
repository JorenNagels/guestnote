import {
  AccountSuspendedException,
  BadRequestException,
  LimitExceededException,
  MessageRejected,
  type SendEmailCommand,
  TooManyRequestsException,
} from '@aws-sdk/client-sesv2'
import { describe, expect, it } from 'vitest'
import { createSesTransport, type SesSendPort } from './ses.ts'
import type { EmailMessage } from './types.ts'

/**
 * The SES call, asserted on its inputs rather than by sending anything.
 *
 * ## Why this file may import the AWS SDK
 *
 * `biome.json` and `packages/db/src/no-unsafe-imports.test.ts` restrict
 * `@aws-sdk/client-sesv2` to `src/ses.ts`, and both list this file as the second exception.
 * The mapping in `classify()` is `instanceof` against the SDK's own exception classes, which
 * is the right way to read them -- the classes are part of the published contract, the error
 * prose is not -- and there is no way to construct one without the import. A test file cannot
 * leak the dependency into a Lambda bundle, which is what the ban is actually protecting.
 *
 * ## No `vi.mock`
 *
 * There is none anywhere in this repo. The transport takes a `SesSendPort`, so the fake is an
 * object, and it breaks loudly if the call shape changes rather than continuing to assert
 * against a shape that no longer exists.
 */

const CONFIG = {
  region: 'eu-central-1',
  from: '"Guestnote" <noreply@guestnote.be>',
  configurationSet: 'guestnote-default',
} as const

const MESSAGE: EmailMessage = {
  to: 'ilse@studiowit.be',
  subject: '123456 is je Guestnote-aanmeldcode',
  html: '<p>123456</p>',
  text: '123456',
  tags: { template: 'sign-in-code' },
}

/** Captures what was handed to SES, and answers however the test needs. */
function fakeClient(answer: () => Promise<{ MessageId?: string | undefined }>) {
  const commands: SendEmailCommand[] = []
  const port: SesSendPort = {
    async send(command) {
      commands.push(command)
      return answer()
    },
  }
  return { port, commands }
}

const accepts = () => Promise.resolve({ MessageId: '0100019...-abcdef' })
const throws = (error: unknown) => () => Promise.reject(error)

describe('the SES transport builds the right SendEmail call', () => {
  it('sends UTF-8 subject, HTML and text from the configured identity', async () => {
    const { port, commands } = fakeClient(accepts)
    const result = await createSesTransport({ ...CONFIG, client: port }).send(MESSAGE)

    expect(result).toEqual({ ok: true, messageId: '0100019...-abcdef' })
    expect(commands).toHaveLength(1)

    const input = commands[0]?.input
    expect(input?.FromEmailAddress).toBe('"Guestnote" <noreply@guestnote.be>')
    expect(input?.Destination?.ToAddresses).toEqual(['ilse@studiowit.be'])
    expect(input?.Content?.Simple?.Subject).toEqual({
      Data: '123456 is je Guestnote-aanmeldcode',
      Charset: 'UTF-8',
    })
    expect(input?.Content?.Simple?.Body?.Html).toEqual({ Data: '<p>123456</p>', Charset: 'UTF-8' })
    expect(input?.Content?.Simple?.Body?.Text).toEqual({ Data: '123456', Charset: 'UTF-8' })
  })

  /**
   * `Charset` gets its own assertion because SES defaults to 7-bit ASCII, and the failure is
   * invisible in every test that uses ASCII fixtures: the mail still sends, and only the first
   * Dutch or French sentence with a diacritic arrives as mojibake.
   */
  it('does not mangle a diacritic', async () => {
    const { port, commands } = fakeClient(accepts)
    await createSesTransport({ ...CONFIG, client: port }).send({
      ...MESSAGE,
      subject: 'Vérifiez votre adresse',
      text: 'Voer je code in om je aan te melden — geldig tot 12:05',
    })
    const simple = commands[0]?.input.Content?.Simple
    expect(simple?.Subject?.Charset).toBe('UTF-8')
    expect(simple?.Body?.Text?.Charset).toBe('UTF-8')
    expect(simple?.Subject?.Data).toBe('Vérifiez votre adresse')
  })

  /**
   * Naming the configuration set is what makes bounces observable at all -- omit it and the
   * message still delivers, with no events published and no reputation metrics recorded. A
   * failure that looks exactly like success is worth a dedicated assertion.
   */
  it('names the configuration set and tags the template', async () => {
    const { port, commands } = fakeClient(accepts)
    await createSesTransport({ ...CONFIG, client: port }).send(MESSAGE)
    expect(commands[0]?.input.ConfigurationSetName).toBe('guestnote-default')
    expect(commands[0]?.input.EmailTags).toEqual([{ Name: 'template', Value: 'sign-in-code' }])
  })

  /**
   * Two absences, both deliberate, both easy to "helpfully" add later:
   *   - Reply-To is absent by choice, not because it would bounce: the apex has had MX since
   *     2026-08-19 (ADR 0005). An auth mail should not offer an unwatched reply channel.
   *   - List management would add an unsubscribe link to a sign-in code.
   */
  it('sets no Reply-To and no list management', async () => {
    const { port, commands } = fakeClient(accepts)
    await createSesTransport({ ...CONFIG, client: port }).send(MESSAGE)
    expect(commands[0]?.input.ReplyToAddresses).toBeUndefined()
    expect(commands[0]?.input.ListManagementOptions).toBeUndefined()
  })

  it('omits EmailTags entirely when there are none', async () => {
    const { port, commands } = fakeClient(accepts)
    const { tags: _tags, ...untagged } = MESSAGE
    await createSesTransport({ ...CONFIG, client: port }).send(untagged)
    expect(commands[0]?.input.EmailTags).toBeUndefined()
  })
})

describe('the SES transport maps failures to three words', () => {
  /**
   * `message` is required by the SDK's exception constructors, so the strings are real ones --
   * which makes the `detail` assertion below meaningful rather than a length check on a stub.
   * The sandbox text in `MessageRejected` is the exact wording that will greet the first
   * attempt to mail an unverified recipient.
   */
  const cases = [
    [
      'TooManyRequestsException',
      new TooManyRequestsException({ $metadata: {}, message: 'Maximum sending rate exceeded.' }),
      'throttled',
    ],
    [
      'LimitExceededException',
      new LimitExceededException({ $metadata: {}, message: 'Daily message quota exceeded.' }),
      'throttled',
    ],
    [
      'MessageRejected',
      new MessageRejected({ $metadata: {}, message: 'Email address is not verified.' }),
      'rejected',
    ],
    [
      'BadRequestException',
      new BadRequestException({ $metadata: {}, message: 'Missing required parameter.' }),
      'rejected',
    ],
    [
      'AccountSuspendedException',
      new AccountSuspendedException({ $metadata: {}, message: 'Your account is suspended.' }),
      'unavailable',
    ],
    ['a plain Error', new Error('socket hang up'), 'unavailable'],
    ['a thrown string', 'nope', 'unavailable'],
  ] as const

  for (const [label, error, expected] of cases) {
    it(`maps ${label} to '${expected}'`, async () => {
      const { port } = fakeClient(throws(error))
      const result = await createSesTransport({ ...CONFIG, client: port }).send(MESSAGE)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.failure).toBe(expected)
      // The provider's own words reach the row in `mail_deliveries`. "rejected" alone does not
      // tell anyone which of the sandbox's several reasons applied.
      expect(result.detail.length).toBeGreaterThan(0)
      if (error instanceof Error) expect(result.detail).toContain(error.message)
    })
  }

  /**
   * The API models `MessageId` as optional, so the types force a branch. An accepted send
   * always has one, and recording an empty string as a provider id would put a row in
   * `mail_deliveries` that the future event consumer can never join to.
   */
  it('treats an accepted send with no MessageId as unavailable', async () => {
    const { port } = fakeClient(() => Promise.resolve({}))
    const result = await createSesTransport({ ...CONFIG, client: port }).send(MESSAGE)
    expect(result).toEqual({
      ok: false,
      failure: 'unavailable',
      detail: 'SES accepted the send but returned no MessageId',
    })
  })
})
