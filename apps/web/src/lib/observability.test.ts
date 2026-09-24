import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Feedback } from './observability.ts'
import { REDACTED } from './scrub.ts'

/**
 * `reportSilentFailure`, which had no test file at all until 2026-09-01.
 *
 * That is the wrong shape for this particular function: it is the single sink for every
 * failure the interface is required to hide, so a fault in it is invisible by construction
 * -- the same property that let a broken enrollment run for eleven days. `mutation-tester`
 * confirmed both of the mutations below survived the whole suite.
 *
 * `.ts` and not `.tsx`: no React, no DOM, so it belongs in the `unit` project.
 *
 * Nothing is mocked. `scrub` runs for real, because the assertion that matters is that
 * scrubbing *happened on the vendor path*, and a stubbed `scrub` would assert only that a
 * function was called.
 */
const { feedbackAvailable, reportFeedback, reportSilentFailure, setFeedbackReporter, setReporter } =
  await import('./observability.ts')

afterEach(() => {
  setReporter(null)
  vi.restoreAllMocks()
})

describe('reportSilentFailure', () => {
  it('scrubs the context before it reaches the vendor', async () => {
    // The highest-severity mutation in the 2026-09-01 sweep: reporting `context` instead of
    // `safe` sends unscrubbed auth-adjacent fields to a third party, and nothing failed.
    // This is the one code path the file's own comment says "deliberately carries
    // auth-adjacent fields", so the double scrub is load-bearing rather than redundant.
    const reporter = vi.fn()
    setReporter(reporter)

    reportSilentFailure('boom', { otp: '194720', ceremony: 'enroll' })

    expect(reporter).toHaveBeenCalledWith('boom', { otp: REDACTED, ceremony: 'enroll' })
  })

  it('keeps the fields that are safe, so this is scrubbing and not dropping', async () => {
    // Without this half, replacing `scrub(context)` with `{}` would also pass.
    const reporter = vi.fn()
    setReporter(reporter)

    reportSilentFailure('boom', { ceremony: 'signin', errorName: 'NotSupportedError' })

    expect(reporter).toHaveBeenCalledWith('boom', {
      ceremony: 'signin',
      errorName: 'NotSupportedError',
    })
  })

  it('writes the CloudWatch line under the prefix a metric filter would match', async () => {
    // The prefix is output, not decoration: it is the only thing a CloudWatch metric filter
    // has to key on, and deleting it survived the sweep.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    reportSilentFailure('boom', { otp: '194720' })

    expect(warn).toHaveBeenCalledWith('[silent-failure] boom', { otp: REDACTED })
  })

  it('writes to CloudWatch even with no reporter installed', async () => {
    // The pairing is the whole point of the file: CloudWatch needs no vendor and is the sink
    // that still works when the DSN is unset -- which is exactly when something is wrong.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    reportSilentFailure('boom')

    expect(warn).toHaveBeenCalledWith('[silent-failure] boom', {})
  })

  it('does not throw when no reporter was ever installed', async () => {
    // A no-op default rather than a queue, per the file's note. An event raised before
    // `instrumentation.ts` runs must not become a second failure on top of the first.
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => reportSilentFailure('boom', { a: 1 })).not.toThrow()
  })
})

describe('reportFeedback', () => {
  const base = {
    category: 'bug' as const,
    message: 'The budget total is off by one cent, code 194720 in my notes',
    name: 'Ilse',
    email: 'ilse@studiowit.be',
    tags: { page: '/weddings/x/budget', otp: '194720' },
  }

  afterEach(() => setFeedbackReporter(null))

  it('resolves false and sends nothing when no inbox is installed', async () => {
    expect(feedbackAvailable()).toBe(false)
    expect(await reportFeedback(base)).toBe(false)
  })

  it('is available once an inbox is installed', () => {
    setFeedbackReporter(async () => true)
    expect(feedbackAvailable()).toBe(true)
  })

  it('scrubs the tags and nothing else -- the message, the reply address and the attachment go as given', async () => {
    // `email` is a redacted key in `scrub.ts`, so scrubbing the whole object instead of the tags
    // would turn the address we reply to into [redacted]. This is the assertion that sees it.
    const reporter = vi.fn(async (_feedback: Feedback) => true)
    setFeedbackReporter(reporter)
    const attachment = { filename: 's.jpeg', contentType: 'image/jpeg', data: new Uint8Array([1]) }

    expect(await reportFeedback({ ...base, attachment })).toBe(true)
    expect(reporter.mock.calls[0]?.[0]).toEqual({
      ...base,
      attachment,
      tags: { page: '/weddings/x/budget', otp: REDACTED },
    })
  })

  it('passes on a reporter that could not deliver in time', async () => {
    setFeedbackReporter(async () => false)
    expect(await reportFeedback(base)).toBe(false)
  })
})

/**
 * The two-bundle split itself cannot be reproduced here: Vitest loads one copy of this module,
 * and Next loads two (`observability.ts`, "The slots live on `globalThis`"). What this pins is
 * the property the fix relies on -- a second, fresh copy of the module reads what the first copy
 * installed. A module `let` fails it; the `globalThis` registry passes.
 */
describe('a second copy of the module', () => {
  afterEach(() => {
    setReporter(null)
    setFeedbackReporter(null)
  })

  it('sees the reporters the first copy installed', async () => {
    const reporter = vi.fn()
    setReporter(reporter)
    setFeedbackReporter(async () => true)

    vi.resetModules()
    const fresh = await import('./observability.ts')

    expect(fresh.feedbackAvailable()).toBe(true)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    fresh.reportSilentFailure('from the other bundle', {})
    expect(reporter).toHaveBeenCalledWith('from the other bundle', {})
  })
})
