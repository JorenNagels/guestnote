/**
 * What must never leave this application, and the one function that enforces it.
 *
 * Deliberately NOT importing `@sentry/nextjs`, and deliberately not `server-only`: the same
 * rule has to hold on both sides of the wire, so the browser config, the server
 * instrumentation and the unit tests all call this one implementation. It takes a plain
 * object and returns a plain object, which is also what makes it testable without standing
 * up an SDK.
 *
 * ## Why scrub at all, when Sentry already scrubs
 *
 * Sentry's default server-side scrubbing keys on field *names* it recognises (`password`,
 * `secret`, `authorization`). Every credential this app actually handles is named something
 * it has never heard of -- `otp`, `code`, `challenge`, `attestationObject` -- and the most
 * dangerous of them, a live six-digit sign-in code, is a plain string in a field called
 * `code`, which is also the name of every harmless error code in the codebase. Relying on a
 * remote default to recognise our vocabulary is the wrong shape: this runs *before* the
 * event leaves the process, so a mistake here cannot be fixed by a setting in a console.
 *
 * ## What is removed, and why each one
 *
 *   - **Sign-in codes.** `verifications.value` holds them hashed (`storeOTP: 'hashed'`), but
 *     the plaintext exists in memory on the request that verifies one, and any frame in that
 *     call stack can capture it. A leaked code is a five-minute window into an account.
 *   - **WebAuthn material.** A challenge, an attestation or an assertion signature in an
 *     error report is a credential ceremony transcript. `credentialId` is deliberately NOT
 *     scrubbed -- it is a public identifier, useless without the private key, and it is the
 *     one field that makes a passkey failure debuggable at all.
 *   - **Session tokens and cookies.** The whole `Cookie` header goes, rather than the session
 *     cookie by name: `__Host-guestnote.session_token` is bearer-equivalent, and a header
 *     allowlist is the only shape where a cookie added later is safe by default.
 *   - **Email addresses.** Personal data under GDPR, and the DPA argument in research/07
 *     section 1 is easier to hold when the error tracker never receives any. The cost is
 *     real: "which planner hit this" becomes a question the logs cannot answer. Accepted --
 *     `userId` survives, and it resolves to a person through our own database, on our terms.
 *
 * Rejected: an allowlist of fields to keep. It is the safer shape in principle and it makes
 * every new field invisible by default, which for a debugging tool means the first report of
 * any new failure arrives empty. This is the trade the other way, and it is why the key list
 * below is matched loosely rather than exactly.
 */

/**
 * Substrings, lowercased. A key is redacted when it *contains* one of these, so
 * `clientDataJSON`, `client_data_json` and `attestation.clientDataJSON` all match without
 * three entries.
 */
const REDACT_KEY_PARTS = [
  'otp',
  'code',
  'secret',
  'token',
  'password',
  'cookie',
  'authorization',
  'challenge',
  'attestation',
  'signature',
  'publickey',
  'privatekey',
  'clientdata',
  'authenticatordata',
  'userhandle',
  'email',
] as const

/**
 * Keys that contain a redact substring but must survive, checked first.
 *
 * `credentialId` contains neither -- it is here because `credential` is the kind of word
 * that gets added to the list above by someone being careful, and this states in one place
 * that doing so would blind the passkey debugging this whole file was written to enable.
 * `statusCode` and `errorCode` contain `code` and are the opposite of sensitive.
 */
const KEEP_KEYS = ['credentialid', 'statuscode', 'errorcode', 'countrycode', 'postcode'] as const

export const REDACTED = '[redacted]'

/**
 * Lowercase and strip everything that is not a letter or a digit.
 *
 * So `clientDataJSON`, `client_data_json` and `client-data-json` all normalise to
 * `clientdatajson` and are caught by the single entry `clientdata`. Without this the
 * substring match is defeated by a separator: `client_data_json` does not contain
 * `clientdata`, which is a hole a key list looks like it covers and does not -- caught by
 * `scrub.test.ts`, 2026-08-31, on a comment that claimed all three spellings matched.
 */
const normalise = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, '')

function shouldRedact(key: string): boolean {
  const flat = normalise(key)
  if (KEEP_KEYS.some((keep) => flat === keep)) return false
  return REDACT_KEY_PARTS.some((part) => flat.includes(part))
}

/**
 * Deep-redact by key name, preserving structure.
 *
 * Cycle-safe through a `WeakSet`, because an error event can carry a request object whose
 * `socket` points back at itself, and a stack overflow inside the reporter would take out
 * the request it was trying to report on -- the failure mode where observability makes an
 * outage worse instead of explaining it.
 *
 * Depth-capped for the same reason. Twelve is well past anything Sentry's event shape
 * reaches and short enough that a pathological object cannot cost a request its latency.
 */
export function scrub<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
  if (depth > 12) return REDACTED as unknown as T
  if (value === null || typeof value !== 'object') return value

  const asObject = value as unknown as object
  if (seen.has(asObject)) return REDACTED as unknown as T
  seen.add(asObject)

  if (Array.isArray(value)) {
    return value.map((item) => scrub(item, depth + 1, seen)) as unknown as T
  }

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = shouldRedact(key) ? REDACTED : scrub(item, depth + 1, seen)
  }
  return out as unknown as T
}

/**
 * The `beforeSend` hook itself, shared by the browser and server SDK configs.
 *
 * Beyond the key sweep: the query string goes entirely. `?reason=session-expired` is the only
 * query this app reads today, but an invitation token lives in a *path* segment and the next
 * one might not -- and a token in a URL is the classic way credentials end up in somebody
 * else's dashboard. Dropping the whole string costs nothing we currently use.
 */
export function scrubEvent<T extends Record<string, unknown>>(event: T): T {
  const scrubbed = scrub(event)
  const request = scrubbed.request as { query_string?: unknown; url?: unknown } | undefined
  if (request && typeof request === 'object') {
    if ('query_string' in request) request.query_string = REDACTED
    if (typeof request.url === 'string') request.url = request.url.split('?')[0] ?? request.url
  }
  return scrubbed
}

/**
 * The event processor for "Report a problem" feedback events (spec 0005), which `scrubEvent`
 * never sees: Sentry runs `beforeSend` on error events only (`event.type === undefined`, read in
 * `@sentry/core` 10.72.0 `client.js`), and a feedback event is `type: 'feedback'`. Its request
 * integration still copies the incoming request onto it, and with `sendDefaultPii: false` that
 * copy keeps the `Cookie` header -- the session token -- because the deny list there filters
 * IP-style headers only. Found by review 2026-09-24, before any deploy.
 *
 * So the request goes, whole, rather than being scrubbed: a feedback event needs none of it (the
 * page it came from is its own `url` field), and running the full `scrubEvent` here instead
 * would also redact `contexts.feedback.contact_email` -- the `email` key rule -- which is the
 * address the planner asked us to reply to. Other event types pass through untouched; they have
 * `beforeSend`.
 */
export function stripFeedbackRequest<T extends { type?: unknown; request?: unknown }>(event: T): T {
  if (event.type !== 'feedback' || !('request' in event)) return event
  const { request: _dropped, ...rest } = event
  return rest as T
}
