'use server'

import {
  createRunSheetItem,
  deleteRunSheetItem,
  moveRunSheetItem,
  type RunSheetFailure,
  updateRunSheetItem,
} from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import { getDb } from '../../../../../../lib/db.ts'
import { currentCaller } from '../../../../../../lib/principal.ts'
import {
  parseRunSheetForm,
  type RunSheetActionResult,
  type RunSheetError,
} from '../../../../../../lib/run-sheet.ts'
import { isUuid } from '../../../../../../lib/uuid.ts'

/**
 * The run sheet's writes. Each resolves the caller itself and hands the repo memberships, from
 * which the repo derives the principal: a Server Function is a POST to its own route, so the
 * layout's session gate never runs for it (CLAUDE.md invariant 7), and the wedding id here is a
 * claim from the client, never a fact.
 *
 * Every argument is `unknown` in spirit. TypeScript has no presence in a request body, so the
 * form is parsed by `parseRunSheetForm` and the ids checked with `isUuid` before Postgres sees them.
 */

/** The route file's path, not the URL the planner sees: `(app)/actions.ts` says why. */
const RUN_SHEET = '/pro/weddings/[id]/run-sheet'

function refusal(reason: RunSheetFailure): RunSheetError {
  if (reason === 'eventNotFound') return 'event'
  if (reason === 'vendorNotFound') return 'vendor'
  return 'notFound'
}

/** Create (`itemId` null) or update. */
export async function saveRunSheetItem(
  weddingId: string,
  itemId: string | null,
  values: unknown,
): Promise<RunSheetActionResult> {
  const c = await currentCaller()
  if (!c || !isUuid(weddingId) || (itemId !== null && !isUuid(itemId))) {
    return { ok: false, error: 'notFound' }
  }
  const read = parseRunSheetForm(values)
  if ('error' in read) return { ok: false, error: read.error }

  const db = getDb()
  const result =
    itemId === null
      ? await createRunSheetItem(db, c.memberships, c.orgId, weddingId, read.eventId, read.input)
      : await updateRunSheetItem(db, c.memberships, c.orgId, weddingId, itemId, read.input)
  if (!result.ok) return { ok: false, error: refusal(result.reason) }
  revalidatePath(RUN_SHEET, 'page')
  return { ok: true }
}

export async function removeRunSheetItem(
  weddingId: string,
  itemId: string,
): Promise<RunSheetActionResult> {
  const c = await currentCaller()
  if (!c || !isUuid(weddingId) || !isUuid(itemId)) return { ok: false, error: 'notFound' }

  const result = await deleteRunSheetItem(getDb(), c.memberships, c.orgId, weddingId, itemId)
  if (!result.ok) return { ok: false, error: refusal(result.reason) }
  revalidatePath(RUN_SHEET, 'page')
  return { ok: true }
}

export async function shiftRunSheetItem(
  weddingId: string,
  itemId: string,
  direction: 'up' | 'down',
): Promise<RunSheetActionResult> {
  const c = await currentCaller()
  if (!c || !isUuid(weddingId) || !isUuid(itemId)) return { ok: false, error: 'notFound' }
  if (direction !== 'up' && direction !== 'down') return { ok: false, error: 'failed' }

  const result = await moveRunSheetItem(
    getDb(),
    c.memberships,
    c.orgId,
    weddingId,
    itemId,
    direction,
  )
  if (!result.ok) return { ok: false, error: refusal(result.reason) }
  revalidatePath(RUN_SHEET, 'page')
  return { ok: true }
}
