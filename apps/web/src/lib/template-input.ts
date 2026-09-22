import type { TemplateInput, TemplateItemInput } from '@guestnote/db'
import { offsetFromForm, TITLE_MAX } from '../components/tasks/form.ts'

/**
 * Parsing for the template forms, shared by both `actions.ts` files. A Server Function's
 * arguments are whatever the POST body said (invariant 7), so the types on the action
 * signatures are a hope and this is the check.
 *
 * Runtime-free of `@guestnote/db` (types only): the client forms import the limits from here,
 * and a runtime import would drag drizzle into the browser bundle.
 *
 * The offset rule is S2's (`offsetFromForm`: whole days, 0 to 3650, before or after) and not a
 * copy, so a template item and the task it becomes can never disagree about what is valid --
 * `createTasks` would throw on the difference, and a throw at apply time is a half-typed plan
 * the planner cannot fix from that screen.
 */

export const TEMPLATE_LIMITS = { name: 120, description: 1000, title: TITLE_MAX } as const

export type TemplateFormError = 'name' | 'description'
export type ItemFormError = 'title' | 'offset'

export function parseTemplateInput(
  raw: unknown,
): { ok: true; input: TemplateInput } | { ok: false; error: TemplateFormError } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'name' }
  const r = raw as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim() : ''
  if (name.length === 0 || name.length > TEMPLATE_LIMITS.name) return { ok: false, error: 'name' }
  const description = typeof r.description === 'string' ? r.description.trim() : ''
  if (description.length > TEMPLATE_LIMITS.description) return { ok: false, error: 'description' }
  return { ok: true, input: { name, description: description || null } }
}

export type ItemFormValues = {
  title: string
  /** A whole number as typed, always non-negative. The direction is `offsetDirection`. */
  offsetDays: string
  offsetDirection: 'before' | 'after'
  assigneeRole: 'planner' | 'couple'
  visibility: 'shared' | 'internal'
}

export const EMPTY_ITEM: ItemFormValues = {
  title: '',
  offsetDays: '',
  offsetDirection: 'before',
  assigneeRole: 'planner',
  visibility: 'shared',
}

export function parseItemInput(
  raw: unknown,
): { ok: true; input: TemplateItemInput } | { ok: false; error: ItemFormError } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'title' }
  const r = raw as Record<string, unknown>
  const title = typeof r.title === 'string' ? r.title.trim() : ''
  if (title.length === 0 || title.length > TEMPLATE_LIMITS.title) {
    return { ok: false, error: 'title' }
  }
  const days = offsetFromForm(
    String(r.offsetDays ?? ''),
    r.offsetDirection === 'after' ? 'after' : 'before',
  )
  if (days === null) return { ok: false, error: 'offset' }
  return {
    ok: true,
    input: {
      title,
      dueOffsetDays: days,
      // Anything that is not the literal 'internal' / 'couple' is the default: the column has a
      // CHECK, so an unknown wire value would otherwise surface as a database error.
      visibility: r.visibility === 'internal' ? 'internal' : 'shared',
      assigneeRole: r.assigneeRole === 'couple' ? 'couple' : 'planner',
    },
  }
}

/** A stored item back to what the planner would have typed, for the edit form. */
export function formFromItem(item: TemplateItemInput): ItemFormValues {
  return {
    title: item.title,
    offsetDays: String(Math.abs(item.dueOffsetDays)),
    offsetDirection: item.dueOffsetDays > 0 ? 'after' : 'before',
    assigneeRole: item.assigneeRole,
    visibility: item.visibility,
  }
}

export type TemplateActionError =
  | TemplateFormError
  | ItemFormError
  | 'forbidden'
  | 'notFound'
  | 'empty'
  | 'full'
