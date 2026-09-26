import type { InviteFailure } from '../../lib/staff-invite.ts'

/**
 * What sign-up's Server Functions hand back to `useActionState`: codes and echoed values, never
 * sentences, for the reason `lib/wedding-parse.ts` gives. Its own file because a `'use server'`
 * module may export nothing but async functions, and the client forms need these types.
 */

/**
 * `create_studio`'s bounds (migration 0010), restated because a client component cannot import
 * `@guestnote/db`. `actions.test.ts` pins the studio one to `MAX_STUDIO_NAME`.
 */
export const STUDIO_NAME_MAX = 80
export const MAX_OWNER_NAME = 120

export type StudioField = 'name' | 'ownerName'

export type StudioFormState = {
  readonly errors?: Partial<Record<StudioField, 'required' | 'tooLong'>>
  /** `forbidden`: no session. `failed`: the database refused a name the form accepted. */
  readonly form?: 'forbidden' | 'failed'
  readonly values?: Readonly<Partial<Record<StudioField, string>>>
}

/** The team step's three rows are `email0`..`email2`, so a row keeps its index across a retry. */
export const TEAM_ROWS = 3

export type TeamFormState = {
  /** Per row index. */
  readonly errors?: Readonly<Record<number, InviteFailure>>
  /** Rows already invited, which the form locks and does not post again. */
  readonly sent?: readonly number[]
  readonly form?: 'forbidden'
  readonly values?: readonly string[]
}

export type JoinOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'expired' | 'accepted' | 'unknown' }
