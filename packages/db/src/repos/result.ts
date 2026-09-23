/**
 * What every repo WRITE returns. Reads return `T | null`, where `null` is the 404 -- no
 * standing, another org's row and a row that does not exist all look the same from outside.
 * A write needs more than that: which parent was missing is something a form can point at.
 *
 * `reason` is camelCase and names what went wrong from the caller's side: `notFound` for the
 * wedding or the row itself, `<parent>NotFound` for a parent the input named (`vendorNotFound`),
 * `forbidden` for a role that may read but not write, and a domain word for a rule
 * (`duplicate`, `full`). One vocabulary, so an action can switch on it without a table per
 * slice.
 *
 * Why not `null` / `boolean` for a write, as the first slices did: a second failure mode then
 * means changing the return type and every caller, and each slice invented its own shape when
 * it needed one -- six of them, until the PR #1 review (2026-09-23).
 */
export type Result<T, R extends string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: R }

export const ok = <T>(value: T): { readonly ok: true; readonly value: T } => ({ ok: true, value })

export const fail = <R extends string>(reason: R): { readonly ok: false; readonly reason: R } => ({
  ok: false,
  reason,
})
