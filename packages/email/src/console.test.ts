import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConsoleTransport } from './console.ts'
import type { EmailMessage } from './types.ts'

/**
 * The transport a fresh clone gets, and until now the only one with no test.
 *
 * Worth having for one reason above the others: **this transport reporting success is what a
 * developer sees when no email arrives.** It returns `{ ok: true }` having sent nothing, by
 * design, so everything it prints is load-bearing -- the code is in the subject, the rendered
 * file is on disk, and the hint says how to stop being this transport. A regression in any of
 * those is invisible from the application's side, because the application is told it worked.
 *
 * Real filesystem, no `vi.mock('node:fs')`: writing files IS the behaviour, and a mocked
 * `writeFileSync` would assert that a function was called rather than that a developer can
 * open the email.
 */
const MESSAGE: EmailMessage = {
  to: 'njoren@gmail.com',
  subject: '194720 is je Guestnote-aanmeldcode',
  html: '<p>194720</p>',
  text: '194720',
}

let outputDir: string
let logged: string[]

beforeEach(() => {
  outputDir = join(mkdtempSync(join(tmpdir(), 'guestnote-mail-')), 'nested')
  logged = []
  vi.spyOn(console, 'info').mockImplementation((line: unknown) => {
    logged.push(String(line))
  })
  vi.spyOn(console, 'warn').mockImplementation((line: unknown) => {
    logged.push(String(line))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(outputDir, { recursive: true, force: true })
})

const output = () => logged.join('\n')

describe('createConsoleTransport', () => {
  it('names itself so a caller can tell which transport it got', () => {
    expect(createConsoleTransport({ outputDir }).name).toBe('console')
  })

  it('creates the output directory it was pointed at, nested and all', async () => {
    // `outputDir` above is deliberately a path whose PARENT was just created, because
    // `.mail` under a fresh clone does not exist and `recursive: true` is what covers it.
    await createConsoleTransport({ outputDir }).send(MESSAGE)

    expect(output()).toContain(outputDir)
  })

  it('writes both parts, so the HTML can be opened and the text diffed', async () => {
    const result = await createConsoleTransport({ outputDir }).send(MESSAGE)
    if (!result.ok) throw new Error('the console transport must not report a failure')

    const path = /file:\s+(\S+)/.exec(output())?.[1]
    if (path === undefined) throw new Error(`no file path in the output:\n${output()}`)
    expect(readFileSync(path, 'utf8')).toBe('<p>194720</p>')
    expect(readFileSync(path.replace(/\.html$/, '.txt'), 'utf8')).toBe('194720')
  })

  it('prints the subject, which is where the code is', async () => {
    // The reason the code is not a parameter to this transport. If the subject ever stops
    // leading with the digits, a developer loses the only copy they can read at a glance.
    await createConsoleTransport({ outputDir }).send(MESSAGE)

    expect(output()).toContain('194720 is je Guestnote-aanmeldcode')
    expect(output()).toContain('njoren@gmail.com')
  })

  it('prints the hint, because "why did no email arrive" is the next question', async () => {
    await createConsoleTransport({ outputDir, hint: 'set THE_FLAG=ses' }).send(MESSAGE)

    expect(output()).toContain('send it: set THE_FLAG=ses')
  })

  it('omits the hint line entirely when there is nothing to suggest', async () => {
    await createConsoleTransport({ outputDir }).send(MESSAGE)

    expect(output()).not.toContain('send it:')
  })

  it('still succeeds, and still prints the code, when the write fails', async () => {
    // A read-only or missing volume must not fail a sign-in: the subject in the log is the
    // part a developer actually needs to get past the screen. `\0` is rejected by every
    // platform's path handling, which is a more honest forced failure than a chmod race.
    const result = await createConsoleTransport({ outputDir: '\0invalid' }).send(MESSAGE)

    expect(result.ok).toBe(true)
    expect(output()).toContain('could not write the rendered email')
    expect(output()).toContain('file:    (write failed)')
    expect(output()).toContain('194720 is je Guestnote-aanmeldcode')
  })

  it('returns a message id that can never be mistaken for one of SES’s', async () => {
    // It is returned rather than left null so a local run writes a `mail_deliveries` row of
    // the same shape a deployed one does -- otherwise the unique index on
    // `provider_message_id` is only ever exercised in production.
    const result = await createConsoleTransport({ outputDir }).send(MESSAGE)
    if (!result.ok) throw new Error('the console transport must not report a failure')

    expect(result.messageId).toMatch(/^console-/)
    expect(result.messageId).toContain('njoren-gmail-com')
  })

  it('gives two sends two different files rather than overwriting the first', async () => {
    const transport = createConsoleTransport({ outputDir })
    const first = await transport.send(MESSAGE)
    const second = await transport.send({ ...MESSAGE, subject: '000000 is je code' })
    if (!first.ok || !second.ok) throw new Error('the console transport must not fail')

    expect(first.messageId).not.toBe(second.messageId)
  })
})
