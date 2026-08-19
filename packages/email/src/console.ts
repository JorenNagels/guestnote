import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EmailMessage, MailTransport, SendResult } from './types.ts'

/**
 * The transport a fresh clone gets: print it, write it to disk, never send it.
 *
 * `apps/web/src/lib/auth.ts` used to hold this as a `console.info` and called it "the only
 * channel that exists". It still needs to exist -- `npm run dev` must work with no AWS
 * credentials and no verified recipient -- but it can do better than a log line now that
 * there is something rendered to look at.
 *
 * ## The development guard is in the caller, not here
 *
 * This file writes to the filesystem, which on Lambda means a read-only volume and in
 * production would mean sign-in codes in a log group. The check that stops that lives in
 * `apps/web/src/lib/mailer.ts`, next to the decision it guards, for the same reason
 * `secretFor()` keeps its `DEV_SECRET` refusal there: `packages/*` reads no environment. A
 * guard here would need `process.env.NODE_ENV`, which is the one rule this package should not
 * be the first to break.
 *
 * ## Why the code is not a parameter
 *
 * It does not need to be. The subject line leads with it -- `"123456 is je
 * Guestnote-aanmeldcode"` -- so printing the subject prints the code, and the transport stays
 * generic enough to be useful for every later template without learning what each one
 * contains.
 */

export type ConsoleTransportConfig = {
  /**
   * Where the rendered files land. Gitignored, and absolute: this package has no idea where
   * the app's working directory is, and a relative path would resolve differently under
   * `npm run dev` at the repo root than under `npm run dev -w @guestnote/web`.
   */
  readonly outputDir: string
}

export function createConsoleTransport(config: ConsoleTransportConfig): MailTransport {
  return {
    name: 'console',

    async send(message: EmailMessage): Promise<SendResult> {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const slug = message.to.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
      const base = join(config.outputDir, `${stamp}-${slug}`)

      let written: string | null = null
      try {
        mkdirSync(config.outputDir, { recursive: true })
        writeFileSync(`${base}.html`, message.html, 'utf8')
        writeFileSync(`${base}.txt`, message.text, 'utf8')
        written = `${base}.html`
      } catch (error) {
        // A failed write must not fail the sign-in. The subject below still carries the code,
        // which is the part a developer actually needs to get past the screen.
        console.warn(`  [guestnote] could not write the rendered email: ${String(error)}`)
      }

      // Loud on purpose, and unchanged in spirit from the stub this replaces: a code you
      // cannot find in a wall of dev-server output is a dead end.
      console.info(
        [
          '',
          '  [guestnote] mail not sent -- console transport',
          `    to:      ${message.to}`,
          `    subject: ${message.subject}`,
          written === null ? '    file:    (write failed)' : `    file:    ${written}`,
          '',
        ].join('\n'),
      )

      /**
       * A synthetic id, prefixed so it can never be mistaken for one of SES's.
       *
       * It is returned rather than left null so that the `mail_deliveries` row a local run
       * writes has the same shape as a deployed one -- otherwise the unique index on
       * `provider_message_id` is only ever exercised in production.
       */
      return { ok: true, messageId: `console-${stamp}-${slug}` }
    },
  }
}
