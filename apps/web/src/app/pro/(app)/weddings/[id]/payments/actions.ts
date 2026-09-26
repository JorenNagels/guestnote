'use server'

import {
  createPayment,
  deletePayment,
  type PaymentInput,
  setPaymentPaidAt,
  updatePayment,
} from '@guestnote/db'
import { paidInstant, parseCents, parseCivilDate } from '../../../../../../lib/money.ts'
import { moneyError, revalidateMoney } from '../../../../../../lib/money-server.ts'
import type { ActionResult } from '../../../../../../lib/money-types.ts'
import { currentOrgId } from '../../../../../../lib/principal.ts'
import { assertWritable } from '../../../../../../lib/trial.ts'
import { isUuid } from '../../../../../../lib/uuid.ts'
import { currentWeddingScope } from '../../../../../../lib/wedding-scope.ts'

/**
 * The payment schedule's writes. Same rules as the budget's: each authorizes itself, and every
 * value is read as text and parsed on the server. See `../budget/actions.ts`.
 */

export type PaymentFormValues = {
  budgetLineId: string
  /** `YYYY-MM-DD`. */
  dueOn: string
  amount: string
  /** `YYYY-MM-DD`, or empty for not paid. */
  paidOn: string
}

function readPayment(v: PaymentFormValues) {
  if (typeof v !== 'object' || v === null) return { error: 'failed' as const }
  const text = (x: unknown) => (typeof x === 'string' ? x : '')
  const budgetLineId = text(v.budgetLineId).trim()
  if (!isUuid(budgetLineId)) return { error: 'line' as const }
  const dueOn = parseCivilDate(text(v.dueOn).trim())
  if (!dueOn) return { error: 'due' as const }
  const amountCents = parseCents(text(v.amount))
  if (amountCents === null) return { error: 'amount' as const }
  const paidText = text(v.paidOn).trim()
  const paidOn = paidText === '' ? null : parseCivilDate(paidText)
  if (paidText !== '' && !paidOn) return { error: 'paidOn' as const }
  const input: PaymentInput = {
    budgetLineId,
    dueOn,
    amountCents,
    paidAt: paidOn ? paidInstant(paidOn) : null,
  }
  return { input }
}

/** Create (`paymentId` null) or update. */
export async function savePayment(
  weddingId: string,
  paymentId: string | null,
  values: PaymentFormValues,
): Promise<ActionResult> {
  await assertWritable(await currentOrgId())
  const scope = await currentWeddingScope(weddingId)
  if (!scope || (paymentId !== null && !isUuid(paymentId))) {
    return { ok: false, error: 'notFound' }
  }
  const read = readPayment(values)
  if ('error' in read) return { ok: false, error: read.error }

  const result =
    paymentId === null
      ? await createPayment(scope, read.input)
      : await updatePayment(scope, paymentId, read.input)
  if (!result.ok) return { ok: false, error: moneyError(result.reason, true) }
  revalidateMoney()
  return { ok: true }
}

/**
 * The quick toggle. "Paid" is stamped with the SERVER's clock, not the browser's: a planner's
 * laptop with a wrong date would otherwise record a payment as made in the future.
 */
export async function markPaymentPaid(
  weddingId: string,
  paymentId: string,
  paid: boolean,
): Promise<ActionResult> {
  await assertWritable(await currentOrgId())
  const scope = await currentWeddingScope(weddingId)
  if (!scope || !isUuid(paymentId)) return { ok: false, error: 'notFound' }

  const result = await setPaymentPaidAt(scope, paymentId, paid === true ? new Date() : null)
  if (!result.ok) return { ok: false, error: moneyError(result.reason, false) }
  revalidateMoney()
  return { ok: true }
}

export async function removePayment(weddingId: string, paymentId: string): Promise<ActionResult> {
  await assertWritable(await currentOrgId())
  const scope = await currentWeddingScope(weddingId)
  if (!scope || !isUuid(paymentId)) return { ok: false, error: 'notFound' }

  const result = await deletePayment(scope, paymentId)
  if (!result.ok) return { ok: false, error: moneyError(result.reason, false) }
  revalidateMoney()
  return { ok: true }
}
