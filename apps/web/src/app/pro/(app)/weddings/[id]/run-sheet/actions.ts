'use server'

import {
  createRunSheetItem,
  deleteRunSheetItem,
  moveRunSheetItem,
  type RunSheetFailure,
  shiftRunSheetTimes,
  updateRunSheetItem,
} from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import { currentOrgId } from '../../../../../../lib/principal.ts'
import {
  parseRunSheetForm,
  parseShiftMinutes,
  type RunSheetActionResult,
  type RunSheetError,
} from '../../../../../../lib/run-sheet.ts'
import { assertWritable } from '../../../../../../lib/trial.ts'
import { isUuid } from '../../../../../../lib/uuid.ts'
import { currentWeddingScope } from '../../../../../../lib/wedding-scope.ts'

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
  if (reason === 'ownerNotFound') return 'owner'
  if (reason === 'shiftCrossesPrevious') return 'shiftCrosses'
  return 'notFound'
}

/** Create (`itemId` null) or update. */
export async function saveRunSheetItem(
  weddingId: string,
  itemId: string | null,
  values: unknown,
): Promise<RunSheetActionResult> {
  await assertWritable(await currentOrgId())
  const scope = await currentWeddingScope(weddingId)
  if (!scope || (itemId !== null && !isUuid(itemId))) {
    return { ok: false, error: 'notFound' }
  }
  const read = parseRunSheetForm(values)
  if ('error' in read) return { ok: false, error: read.error }

  const result =
    itemId === null
      ? await createRunSheetItem(scope, read.eventId, read.input)
      : await updateRunSheetItem(scope, itemId, read.input)
  if (!result.ok) return { ok: false, error: refusal(result.reason) }
  revalidatePath(RUN_SHEET, 'page')
  return { ok: true }
}

export async function removeRunSheetItem(
  weddingId: string,
  itemId: string,
): Promise<RunSheetActionResult> {
  await assertWritable(await currentOrgId())
  const scope = await currentWeddingScope(weddingId)
  if (!scope || !isUuid(itemId)) return { ok: false, error: 'notFound' }

  const result = await deleteRunSheetItem(scope, itemId)
  if (!result.ok) return { ok: false, error: refusal(result.reason) }
  revalidatePath(RUN_SHEET, 'page')
  return { ok: true }
}

export async function shiftRunSheetItem(
  weddingId: string,
  itemId: string,
  direction: 'up' | 'down',
): Promise<RunSheetActionResult> {
  await assertWritable(await currentOrgId())
  const scope = await currentWeddingScope(weddingId)
  if (!scope || !isUuid(itemId)) return { ok: false, error: 'notFound' }
  if (direction !== 'up' && direction !== 'down') return { ok: false, error: 'failed' }

  const result = await moveRunSheetItem(scope, itemId, direction)
  if (!result.ok) return { ok: false, error: refusal(result.reason) }
  revalidatePath(RUN_SHEET, 'page')
  return { ok: true }
}

/**
 * "Schuif dit en alles erna op" (spec 0009 B2): `itemId` and every item after it in its day move
 * by `deltaMin` minutes, in one transaction. The delta is parsed here and not trusted from the
 * client's own check -- the repo throws on a bad one, and a planner's typo must come back as the
 * field's error and not as a 500.
 */
export async function shiftRunSheetFrom(
  weddingId: string,
  itemId: string,
  deltaMin: unknown,
): Promise<RunSheetActionResult> {
  await assertWritable(await currentOrgId())
  const scope = await currentWeddingScope(weddingId)
  if (!scope || !isUuid(itemId)) return { ok: false, error: 'notFound' }
  const delta = parseShiftMinutes(deltaMin)
  if (delta === null) return { ok: false, error: 'shift' }

  const result = await shiftRunSheetTimes(scope, itemId, delta)
  if (!result.ok) return { ok: false, error: refusal(result.reason) }
  revalidatePath(RUN_SHEET, 'page')
  return { ok: true }
}
