'use server'

import {
  addTemplateItem,
  applyTemplate,
  deleteTemplate,
  deleteTemplateItem,
  duplicateTemplate,
  moveTemplateItem,
  type TemplateWriteResult,
  templateAccess,
  updateTemplate,
  updateTemplateItem,
} from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getDb } from '../../../../../lib/db.ts'
import { currentCaller } from '../../../../../lib/principal.ts'
import {
  parseItemInput,
  parseTemplateInput,
  type TemplateActionError,
} from '../../../../../lib/template-input.ts'
import { isUuid } from '../../../../../lib/uuid.ts'

/**
 * The template editor's writes. Each one does its own authorization: a Server Function is a POST
 * to its own route, so the layout's session gate never runs for it (invariant 7).
 *
 * Every id arrives from the client and none is trusted. A malformed one is refused here because
 * Postgres throws on a bad uuid cast, which would turn a 404 into a 500; a well-formed one that
 * names another organisation's template is `notFound` from the repo, the same answer as one that
 * does not exist.
 *
 * Writes are owner and admin only, stated three times (see `../actions.ts`). **Apply is not a
 * template write**: it creates tasks, which any staff member may do on a wedding they are
 * assigned to, so it asks `createTasks` and not `canWrite`.
 *
 * Nothing catches a database error: what can reach one is an outage, and swallowing it into a
 * result would hide it from the log Next writes for an uncaught throw.
 */

export type EditResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: TemplateActionError }

export type DuplicateResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: TemplateActionError }

export type ApplyResult =
  | { readonly ok: true; readonly count: number }
  | { readonly ok: false; readonly error: TemplateActionError }

// `/pro/templates` is the route file path, not the URL (see `../actions.ts`). `layout` so the list
// and every editor below it go stale together: a name and an item count show on both.
const refresh = () => revalidatePath('/pro/templates', 'layout')

async function writer(...ids: unknown[]) {
  if (!ids.every(isUuid)) return null
  const c = await currentCaller()
  if (!c || !templateAccess(c.memberships, c.orgId)?.canWrite) return null
  return { m: c.memberships, orgId: c.orgId }
}

const FORBIDDEN = { ok: false, error: 'forbidden' } as const

function settle(r: TemplateWriteResult<unknown>): EditResult {
  if (!r.ok) return { ok: false, error: r.reason }
  refresh()
  return { ok: true }
}

export async function updateTemplateAction(
  templateId: string,
  input: unknown,
): Promise<EditResult> {
  const parsed = parseTemplateInput(input)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const ctx = await writer(templateId)
  if (!ctx) return FORBIDDEN
  return settle(await updateTemplate(getDb(), ctx.m, ctx.orgId, templateId, parsed.input))
}

export async function deleteTemplateAction(templateId: string): Promise<EditResult> {
  const ctx = await writer(templateId)
  if (!ctx) return FORBIDDEN
  return settle(await deleteTemplate(getDb(), ctx.m, ctx.orgId, templateId))
}

export async function duplicateTemplateAction(templateId: string): Promise<DuplicateResult> {
  const ctx = await writer(templateId)
  if (!ctx) return FORBIDDEN
  const t = await getTranslations('app.s7')
  // The source's name is read inside the repo's transaction; only the suffix is copy.
  const r = await duplicateTemplate(getDb(), ctx.m, ctx.orgId, templateId, t('copySuffix'))
  if (!r.ok) return { ok: false, error: r.reason }
  refresh()
  return { ok: true, id: r.value.id }
}

export async function addItemAction(templateId: string, input: unknown): Promise<EditResult> {
  const parsed = parseItemInput(input)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const ctx = await writer(templateId)
  if (!ctx) return FORBIDDEN
  return settle(await addTemplateItem(getDb(), ctx.m, ctx.orgId, templateId, parsed.input))
}

export async function updateItemAction(
  templateId: string,
  itemId: string,
  input: unknown,
): Promise<EditResult> {
  const parsed = parseItemInput(input)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const ctx = await writer(templateId, itemId)
  if (!ctx) return FORBIDDEN
  return settle(
    await updateTemplateItem(getDb(), ctx.m, ctx.orgId, templateId, itemId, parsed.input),
  )
}

export async function deleteItemAction(templateId: string, itemId: string): Promise<EditResult> {
  const ctx = await writer(templateId, itemId)
  if (!ctx) return FORBIDDEN
  return settle(await deleteTemplateItem(getDb(), ctx.m, ctx.orgId, templateId, itemId))
}

export async function moveItemAction(
  templateId: string,
  itemId: string,
  direction: unknown,
): Promise<EditResult> {
  if (direction !== 'up' && direction !== 'down') return { ok: false, error: 'notFound' }
  const ctx = await writer(templateId, itemId)
  if (!ctx) return FORBIDDEN
  return settle(await moveTemplateItem(getDb(), ctx.m, ctx.orgId, templateId, itemId, direction))
}

export async function applyTemplateAction(
  templateId: string,
  weddingId: string,
): Promise<ApplyResult> {
  if (!isUuid(templateId) || !isUuid(weddingId)) return { ok: false, error: 'notFound' }
  const c = await currentCaller()
  if (!c) return { ok: false, error: 'notFound' }

  const r = await applyTemplate(getDb(), c.memberships, c.orgId, templateId, weddingId)
  if (!r.ok) return { ok: false, error: r.reason }
  // The wedding's overview shows task counts and the checklist shows the tasks themselves.
  revalidatePath('/pro/weddings/[id]', 'layout')
  return { ok: true, count: r.value.count }
}
