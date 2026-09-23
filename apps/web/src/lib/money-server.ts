import 'server-only'
import type { MoneyFailure } from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import type { MoneyError } from './money-types.ts'

/*
 * What the two money `actions.ts` files share. Who the caller is comes from `principal.ts`'s
 * `currentCaller`, like every other Server Function.
 */

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
  if (reason === 'vendorNotFound') return 'vendor'
  if (reason === 'lineNotFound' && lineIsField) return 'line'
  return 'notFound'
}
