'use server'

import { headers } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { reportFeedback } from '../../../../lib/observability.ts'
import { currentMemberships, currentOrgId, currentSession } from '../../../../lib/principal.ts'
import { isUuid } from '../../../../lib/uuid.ts'
import {
  REPORT_CATEGORIES,
  REPORT_MAX_CHARS,
  REPORT_SCREENSHOT_MAX_BYTES,
  type ReportCategory,
} from './limits.ts'

/**
 * "Report a problem" (spec 0005). Staff only -- a couple or a vendor goes through their
 * planner -- so this refuses anyone with no `org_members` row, and resolves the session
 * itself because a Server Function is a POST to its own route (invariant 7).
 *
 * Reports go to Sentry's User Feedback inbox through `lib/observability.ts`, which is why
 * nothing here imports the SDK.
 */

export type ReportFailure =
  | 'forbidden'
  | 'empty'
  | 'tooLong'
  | 'badScreenshot'
  | 'rateLimited'
  | 'unavailable'
export type ReportOutcome = { ok: true } | { ok: false; reason: ReportFailure }

/**
 * Five delivered reports an hour per user, counted in this process only. Weak on purpose and accepted in the
 * spec: the reporters are signed-in staff, and each Lambda instance counting separately means
 * a determined planner gets five per warm instance. Rejected: the `rate_limits` table, which
 * Better Auth's adapter writes and which has no tenant column -- a writer from here would be
 * the third sanctioned bypass, which is where invariant 1 says to stop.
 */
const SCREENSHOT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const WINDOW_MS = 60 * 60 * 1000
const PER_WINDOW = 5
// Not exported, and no reset function either: every async export of a `'use server'` module is
// a POST endpoint, so a test hook here would let anyone clear their own limit. The test takes a
// fresh module per case instead.
const recent = new Map<string, number[]>()

/**
 * Checked before sending, recorded only after a report arrived: a planner told "try again" after
 * a failed send must not spend the hour's budget retrying it (review, 2026-09-24).
 */
function withinLimit(userId: string, now: number): boolean {
  const kept = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS)
  recent.set(userId, kept)
  return kept.length < PER_WINDOW
}

function recordSent(userId: string, now: number): void {
  const kept = recent.get(userId) ?? []
  kept.push(now)
  recent.set(userId, kept)
}

export async function sendReport(formData: FormData): Promise<ReportOutcome> {
  const [session, memberships, orgId] = await Promise.all([
    currentSession(),
    currentMemberships(),
    currentOrgId(),
  ])
  if (!session || !memberships || !orgId || memberships.orgs.length === 0) {
    return { ok: false, reason: 'forbidden' }
  }

  // CRLF to LF before measuring: multipart encoding sends a textarea's line breaks as `\r\n`,
  // and the browser's `maxLength` counted each as one character.
  const message = String(formData.get('message') ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (!message) return { ok: false, reason: 'empty' }
  if (message.length > REPORT_MAX_CHARS) return { ok: false, reason: 'tooLong' }

  const rawCategory = String(formData.get('category') ?? '')
  const category: ReportCategory = (REPORT_CATEGORIES as readonly string[]).includes(rawCategory)
    ? (rawCategory as ReportCategory)
    : 'bug'

  const screenshot = formData.get('screenshot')
  let attachment: { filename: string; contentType: string; data: Uint8Array } | undefined
  if (screenshot instanceof File && screenshot.size > 0) {
    // The browser shrinks it first (`report-dialog.tsx`); this is the check that does not
    // trust the browser. Raster images only -- not `image/*`, which admits `image/svg+xml`, and
    // an SVG can carry script into whatever opens it in the inbox.
    if (!SCREENSHOT_TYPES.has(screenshot.type) || screenshot.size > REPORT_SCREENSHOT_MAX_BYTES) {
      return { ok: false, reason: 'badScreenshot' }
    }
    attachment = {
      filename: `screenshot.${screenshot.type.slice('image/'.length).replace(/[^a-z0-9]/g, '') || 'img'}`,
      contentType: screenshot.type,
      data: new Uint8Array(await screenshot.arrayBuffer()),
    }
  }

  if (!withinLimit(session.userId, Date.now())) return { ok: false, reason: 'rateLimited' }

  const page = pagePath(String(formData.get('page') ?? ''))
  const [requestHeaders, locale] = await Promise.all([headers(), getLocale()])

  const sent = await reportFeedback({
    category,
    message,
    name: session.name ?? session.email,
    email: session.email,
    tags: {
      page,
      orgId,
      weddingId: weddingIdFrom(page) ?? 'none',
      locale,
      userAgent: (requestHeaders.get('user-agent') ?? 'unknown').slice(0, 200),
    },
    attachment,
  }).catch((error: unknown) => {
    // Logged here and not through `reportSilentFailure`, which would send the failure to the
    // same Sentry that just failed to take the report. CloudWatch keeps it.
    console.error('[report] feedback not delivered', error)
    return false
  })

  if (!sent) return { ok: false, reason: 'unavailable' }
  recordSent(session.userId, Date.now())
  return { ok: true }
}

/**
 * The page the planner was on, as the browser reports it. Untrusted and only ever a tag, so
 * it is clamped rather than validated: a path, no query string (which can carry a token on
 * the public routes), at most 200 characters.
 */
function pagePath(raw: string): string {
  const path = raw.split(/[?#]/)[0] ?? ''
  return path.startsWith('/') ? path.slice(0, 200) : 'unknown'
}

/** `/weddings/<uuid>/...` names the wedding the report is about. */
function weddingIdFrom(page: string): string | null {
  const id = /^\/weddings\/([^/]+)/.exec(page)?.[1]
  return id && isUuid(id) ? id : null
}
