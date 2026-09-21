import type { VendorInput, WeddingVendorStatus } from '@guestnote/db'

/**
 * Parsing for the vendor forms, shared by both `actions.ts` files. A Server Function's
 * arguments are whatever the POST body said (invariant 7), so the TypeScript types on the
 * action signatures are a hope and this is the check.
 *
 * `null` from a parser means "refuse". Failures carry no message on purpose: the form
 * already shows what is required, and an error string built from input is a string to escape.
 *
 * The status list is spelled out here and not imported from the schema: `@guestnote/db`
 * drags drizzle into any client bundle that touches it, and the status select is a client
 * component. `vendor-input.test.ts` compares this list with `schema.WEDDING_VENDOR_STATUSES`,
 * so the two cannot drift without a red test.
 */

export const VENDOR_STATUSES = [
  'considering',
  'contacted',
  'quoted',
  'booked',
  'declined',
] as const satisfies readonly WeddingVendorStatus[]

export const LIMITS = { name: 120, category: 60, email: 254, phone: 40, notes: 2000 } as const

// Deliberately loose: one @, something either side, a dot in the domain. Real validation of
// an address is sending it mail; a stricter regex only rejects the odd valid one.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length > max) return undefined
  return trimmed === '' ? null : trimmed
}

export function parseVendorInput(raw: unknown): VendorInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const name = text(r.name, LIMITS.name)
  const category = text(r.category, LIMITS.category)
  const email = text(r.email, LIMITS.email)
  const phone = text(r.phone, LIMITS.phone)
  const notes = text(r.notes, LIMITS.notes)
  if (!name || !category) return null
  if (email === undefined || phone === undefined || notes === undefined) return null
  if (email !== null && !EMAIL.test(email)) return null
  return { name, category, email, phone, notes }
}

export function parseStatus(raw: unknown): WeddingVendorStatus | null {
  return VENDOR_STATUSES.find((s) => s === raw) ?? null
}

export function parseNotes(raw: unknown): { value: string | null } | null {
  const notes = text(raw, LIMITS.notes)
  return notes === undefined ? null : { value: notes }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A uuid, or `null`. Postgres would throw on a malformed one; this turns that into a refusal. */
export function parseId(raw: unknown): string | null {
  return typeof raw === 'string' && UUID.test(raw) ? raw : null
}

/**
 * What an action answers. Plain data, never a thrown error: a Server Function that throws
 * reaches the client as an opaque digest, and the form could not say which field was wrong.
 */
export type VendorActionResult =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly error: 'invalid' | 'forbidden' | 'notFound' | 'duplicate'
    }
