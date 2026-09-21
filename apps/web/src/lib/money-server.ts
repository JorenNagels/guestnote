import 'server-only'
import type { Memberships, MoneyFailure } from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import type { MoneyError } from '../components/money/types.ts'
import { currentMemberships, currentOrgId } from './principal.ts'

/**
 * What the two money `actions.ts` files share. Neither file may be guarded by the route group
 * (a Server Function is a POST to its own route, CLAUDE.md invariant 7), so each action calls
 * `moneyCaller()` first and does nothing when it is `null`. The repo then re-derives the principal
 * from the membership rows, so this is the "is anybody there" check and not the authorization.
 */
export async function moneyCaller(): Promise<{ memberships: Memberships; orgId: string } | null> {
  const [memberships, orgId] = await Promise.all([currentMemberships(), currentOrgId()])
  if (!memberships || !orgId) return null
  return { memberships, orgId }
}

/**
 * Both screens read both tables: the budget draws paid bars from payments, and the payment form
 * lists budget lines. So any write refreshes both. The path is the ROUTE FILE's, not the URL the
 * planner sees -- `proxy.ts` rewrites `/weddings/...` to `/pro/weddings/...`, and
 * `(app)/actions.ts` explains why writing the visible path here would invalidate nothing.
 */
export function revalidateMoney(): void {
  revalidatePath('/pro/weddings/[id]/budget', 'page')
  revalidatePath('/pro/weddings/[id]/payments', 'page')
}

/** The reason a repo write refused, as the key the form shows. `line` is the payment form's own. */
export function moneyError(reason: MoneyFailure, lineIsField: boolean): MoneyError {
  if (reason === 'vendor-not-found') return 'vendor'
  if (reason === 'line-not-found' && lineIsField) return 'line'
  return 'notFound'
}
