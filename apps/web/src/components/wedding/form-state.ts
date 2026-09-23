import type { Memberships } from '@guestnote/db'
import type { FieldError } from './parse.ts'

/**
 * What a wedding or event Server Function hands back to `useActionState`. Codes and echoed
 * values, never sentences: `parse.ts` says why. It sits in its own file because a `'use server'`
 * module may export nothing but async functions, and the client form needs the type.
 *
 * `values` echoes what was posted. React 19 resets an uncontrolled form when its action
 * finishes, so without the echo a validation error would also wipe what the planner typed.
 */
export type FormState = {
  readonly errors?: Readonly<Record<string, FieldError>>
  readonly form?: 'forbidden' | 'failed'
  readonly notice?: 'saved' | 'removed'
  readonly values?: Readonly<Record<string, string>>
}

export const EMPTY_FORM_STATE: FormState = {}

/** The string fields of a post, for the echo. A `File` is dropped, never echoed. */
export function echoValues(fd: FormData, keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of keys) {
    const v = fd.get(key)
    if (typeof v === 'string') out[key] = v
  }
  return out
}

/**
 * Owner and admin, in this organisation, may create a wedding; a `member` may not.
 *
 * The repo enforces the same thing through `principalForOrg`, so this is not the gate. It
 * exists so the page can say so in a sentence before showing a form, and so the action can
 * answer `forbidden` where the repo can only answer `null` -- which is also what five slug
 * collisions look like. Two answers for two different reasons.
 */
export function canCreateWedding(m: Memberships, orgId: string): boolean {
  const role = m.orgs.find((o) => o.orgId === orgId)?.role
  return role === 'owner' || role === 'admin'
}
