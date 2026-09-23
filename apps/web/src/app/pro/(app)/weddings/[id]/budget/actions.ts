'use server'

import { createBudgetLine, deleteBudgetLine, updateBudgetLine } from '@guestnote/db'
import type { ActionResult } from '../../../../../../components/money/types.ts'
import { getDb } from '../../../../../../lib/db.ts'
import { cleanText, parseCents } from '../../../../../../lib/money.ts'
import { moneyError, revalidateMoney } from '../../../../../../lib/money-server.ts'
import { reportSilentFailure } from '../../../../../../lib/observability.ts'
import { currentCaller } from '../../../../../../lib/principal.ts'
import { isUuid } from '../../../../../../lib/uuid.ts'

/**
 * The budget's writes. Each does its own authorization (`currentCaller`, then the repo's
 * `staffPrincipal`), because a Server Function is a POST to its own route and the layout's
 * session gate never runs for it.
 *
 * Every value arrives as text, because a Server Function argument is whatever the request body
 * said and TypeScript has no presence there. The amounts are parsed HERE, with the same
 * `parseCents` the form previews with, so there is one reading of "1.234,50" and it is the server's.
 */

export type LineFormValues = {
  category: string
  label: string
  estimate: string
  /** Empty means "not known yet", which is stored as null and counts as 0 spent. */
  actual: string
  /** A `wedding_vendors` id, or empty for none. */
  weddingVendorId: string
}

function readLine(v: LineFormValues) {
  if (typeof v !== 'object' || v === null) return { error: 'failed' as const }
  const text = (x: unknown) => (typeof x === 'string' ? x : '')
  const category = cleanText(text(v.category), 60)
  if (!category) return { error: 'category' as const }
  const label = cleanText(text(v.label), 120)
  if (!label) return { error: 'label' as const }
  const estimateCents = parseCents(text(v.estimate))
  if (estimateCents === null) return { error: 'estimate' as const }
  const actualText = text(v.actual).trim()
  const actualCents = actualText === '' ? null : parseCents(actualText)
  if (actualText !== '' && actualCents === null) return { error: 'actual' as const }
  const vendorId = text(v.weddingVendorId).trim()
  if (vendorId !== '' && !isUuid(vendorId)) return { error: 'vendor' as const }
  return {
    input: {
      category,
      label,
      estimateCents,
      actualCents,
      weddingVendorId: vendorId === '' ? null : vendorId,
    },
  }
}

/** Create (`lineId` null) or update. */
export async function saveBudgetLine(
  weddingId: string,
  lineId: string | null,
  values: LineFormValues,
): Promise<ActionResult> {
  const caller = await currentCaller()
  if (!caller || !isUuid(weddingId) || (lineId !== null && !isUuid(lineId))) {
    return { ok: false, error: 'notFound' }
  }
  const read = readLine(values)
  if ('error' in read) return { ok: false, error: read.error }

  try {
    const db = getDb()
    const result =
      lineId === null
        ? await createBudgetLine(db, caller.memberships, caller.orgId, weddingId, read.input)
        : await updateBudgetLine(
            db,
            caller.memberships,
            caller.orgId,
            weddingId,
            lineId,
            read.input,
          )
    if (!result.ok) return { ok: false, error: moneyError(result.reason, false) }
  } catch (error) {
    reportSilentFailure('saveBudgetLine failed', { error: String(error) })
    return { ok: false, error: 'failed' }
  }
  revalidateMoney()
  return { ok: true }
}

export async function removeBudgetLine(weddingId: string, lineId: string): Promise<ActionResult> {
  const caller = await currentCaller()
  if (!caller || !isUuid(weddingId) || !isUuid(lineId)) return { ok: false, error: 'notFound' }

  try {
    const result = await deleteBudgetLine(
      getDb(),
      caller.memberships,
      caller.orgId,
      weddingId,
      lineId,
    )
    if (!result.ok) return { ok: false, error: moneyError(result.reason, false) }
  } catch (error) {
    reportSilentFailure('removeBudgetLine failed', { error: String(error) })
    return { ok: false, error: 'failed' }
  }
  revalidateMoney()
  return { ok: true }
}
