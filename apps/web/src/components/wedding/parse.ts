import type { WeddingEventInput, WeddingInput } from '@guestnote/db'

/**
 * Form data to the repo's input types, or the reasons it cannot be.
 *
 * ## Why the errors are codes
 *
 * A Server Function is a POST, and its return value crosses to the client. Returning a
 * sentence would make the server pick the language and would put copy in an `actions.ts`
 * where no catalogue reaches it. So each failure is a short code, and
 * `wedding-form.tsx` maps the code to `app.weddingPages.errors.*`. Rejected: throwing -- Next turns a
 * thrown error into a generic 500 page in production and the field the person got wrong is lost.
 *
 * ## Why this re-checks what the browser already checked
 *
 * The inputs are `type="date"`, `type="number"` and so on, and a browser refuses a bad value
 * before it posts. But a Server Function is callable by anything that can POST to the origin,
 * so the browser's check is a convenience and this is the rule. Every bound below is also a
 * bound the database has (`weddings_headcount_check`, `weddings_color_check`), or one the
 * interface would break on (a 5 MB note).
 */

export type FieldError =
  | 'required'
  | 'tooLong'
  | 'invalidDate'
  | 'invalidNumber'
  | 'invalidTime'
  | 'invalidColor'
  | 'invalidStatus'

export type WeddingField =
  | 'coupleDisplayName'
  | 'weddingDate'
  | 'venue'
  | 'headcount'
  | 'notes'
  | 'color'
  | 'status'

export type EventField = 'label' | 'startsOn' | 'startsAt' | 'venue'

export type Parsed<T, F extends string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: Partial<Record<F, FieldError>> }

export const MAX_COUPLE = 120
export const MAX_VENUE = 200
export const MAX_NOTES = 5000
export const MAX_HEADCOUNT = 100_000
export const MAX_EVENT_LABEL = 120

const HEX = /^#[0-9A-Fa-f]{6}$/
const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/
const WHOLE_NUMBER = /^\d{1,9}$/
export const STATUSES = ['draft', 'live', 'archived'] as const

/** A stored status is `text` + CHECK, so the repo types it `string`; this narrows it for the form. */
export function asStatus(value: string): (typeof STATUSES)[number] {
  return STATUSES.find((s) => s === value) ?? 'draft'
}

function text(fd: FormData, key: string): string {
  const v = fd.get(key)
  // A `File` is what a hand-made multipart post could send. Treated as absent, not coerced.
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * A real calendar date. `2027-02-30` matches the shape and is not a day, and Postgres would
 * refuse it with an error nobody wants to read, so it is checked by round trip.
 */
export function isCivilDate(value: string): boolean {
  const m = CIVIL_DATE.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const probe = new Date(Date.UTC(y, mo - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d
}

function optionalText(
  value: string,
  max: number,
): { value: string | null } | { error: FieldError } {
  if (value === '') return { value: null }
  if (value.length > max) return { error: 'tooLong' }
  return { value }
}

export function parseWeddingForm(fd: FormData): Parsed<WeddingInput, WeddingField> {
  const errors: Partial<Record<WeddingField, FieldError>> = {}

  const couple = text(fd, 'coupleDisplayName')
  if (couple === '') errors.coupleDisplayName = 'required'
  else if (couple.length > MAX_COUPLE) errors.coupleDisplayName = 'tooLong'

  const dateRaw = text(fd, 'weddingDate')
  let weddingDate: string | null = null
  if (dateRaw !== '') {
    if (isCivilDate(dateRaw)) weddingDate = dateRaw
    else errors.weddingDate = 'invalidDate'
  }

  const venue = optionalText(text(fd, 'venue'), MAX_VENUE)
  if ('error' in venue) errors.venue = venue.error

  const notes = optionalText(text(fd, 'notes'), MAX_NOTES)
  if ('error' in notes) errors.notes = notes.error

  const headcountRaw = text(fd, 'headcount')
  let headcount: number | null = null
  if (headcountRaw !== '') {
    const n = WHOLE_NUMBER.test(headcountRaw) ? Number(headcountRaw) : Number.NaN
    if (Number.isInteger(n) && n >= 0 && n <= MAX_HEADCOUNT) headcount = n
    else errors.headcount = 'invalidNumber'
  }

  const colorRaw = text(fd, 'color')
  let color: string | null = null
  if (colorRaw !== '') {
    if (HEX.test(colorRaw)) color = colorRaw.toUpperCase()
    else errors.color = 'invalidColor'
  }

  const statusRaw = text(fd, 'status')
  // Absent means draft: the new-wedding form has no status field of its own.
  const status = statusRaw === '' ? 'draft' : STATUSES.find((s) => s === statusRaw)
  if (!status) errors.status = 'invalidStatus'

  if (Object.keys(errors).length > 0 || !status) return { ok: false, errors }
  return {
    ok: true,
    value: {
      coupleDisplayName: couple,
      weddingDate,
      venue: 'value' in venue ? venue.value : null,
      headcount,
      notes: 'value' in notes ? notes.value : null,
      color,
      status,
    },
  }
}

export function parseEventForm(fd: FormData): Parsed<WeddingEventInput, EventField> {
  const errors: Partial<Record<EventField, FieldError>> = {}

  const label = text(fd, 'label')
  if (label === '') errors.label = 'required'
  else if (label.length > MAX_EVENT_LABEL) errors.label = 'tooLong'

  const startsOn = text(fd, 'startsOn')
  if (startsOn === '') errors.startsOn = 'required'
  else if (!isCivilDate(startsOn)) errors.startsOn = 'invalidDate'

  const timeRaw = text(fd, 'startsAt')
  let startsAt: string | null = null
  if (timeRaw !== '') {
    if (TIME.test(timeRaw)) startsAt = timeRaw
    else errors.startsAt = 'invalidTime'
  }

  const venue = optionalText(text(fd, 'venue'), MAX_VENUE)
  if ('error' in venue) errors.venue = venue.error

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { label, startsOn, startsAt, venue: 'value' in venue ? venue.value : null },
  }
}
