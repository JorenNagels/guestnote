'use server'

import {
  createPayment,
  deletePayment,
  type PaymentInput,
  setPaymentPaidAt,
  updatePayment,
} from '@guestnote/db'
import type { ActionResult } from '../../../../../../components/money/types.ts'
import { getDb } from '../../../../../../lib/db.ts'
import { paidInstant, parseCents, parseCivilDate } from '../../../../../../lib/money.ts'
import { moneyError, revalidateMoney } from '../../../../../../lib/money-server.ts'
import { reportSilentFailure } from '../../../../../../lib/observability.ts'
import { currentCaller } from '../../../../../../lib/principal.ts'
import { isUuid } from '../../../../../../lib/uuid.ts'

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
  const caller = await currentCaller()
  if (!caller || !isUuid(weddingId) || (paymentId !== null && !isUuid(paymentId))) {
    return { ok: false, error: 'notFound' }
  }
  const read = readPayment(values)
  if ('error' in read) return { ok: false, error: read.error }

  try {
    const db = getDb()
    const result =
      paymentId === null
        ? await createPayment(db, caller.memberships, caller.orgId, weddingId, read.input)
        : await updatePayment(
            db,
            caller.memberships,
            caller.orgId,
            weddingId,
            paymentId,
            read.input,
          )
    if (!result.ok) return { ok: false, error: moneyError(result.reason, true) }
  } catch (error) {
    reportSilentFailure('savePayment failed', { error: String(error) })
    return { ok: false, error: 'failed' }
  }
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
  const caller = await currentCaller()
  if (!caller || !isUuid(weddingId) || !isUuid(paymentId)) return { ok: false, error: 'notFound' }

  try {
    const result = await setPaymentPaidAt(
      getDb(),
      caller.memberships,
      caller.orgId,
      weddingId,
      paymentId,
      paid === true ? new Date() : null,
    )
    if (!result.ok) return { ok: false, error: moneyError(result.reason, false) }
  } catch (error) {
    reportSilentFailure('markPaymentPaid failed', { error: String(error) })
    return { ok: false, error: 'failed' }
  }
  revalidateMoney()
  return { ok: true }
}

export async function removePayment(weddingId: string, paymentId: string): Promise<ActionResult> {
  const caller = await currentCaller()
  if (!caller || !isUuid(weddingId) || !isUuid(paymentId)) return { ok: false, error: 'notFound' }

  try {
    const result = await deletePayment(
      getDb(),
      caller.memberships,
      caller.orgId,
      weddingId,
      paymentId,
    )
    if (!result.ok) return { ok: false, error: moneyError(result.reason, false) }
  } catch (error) {
    reportSilentFailure('removePayment failed', { error: String(error) })
    return { ok: false, error: 'failed' }
  }
  revalidateMoney()
  return { ok: true }
}
