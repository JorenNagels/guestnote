import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Db } from '../client.ts'
import { newId } from '../id.ts'
import { taskTemplates, templateItems } from '../schema/templates.ts'
import { type Principal, type TenantDb, withTenant } from '../tenant.ts'
import { type Memberships, principalForOrg, principalForWedding } from './memberships.ts'
import { fail, ok, type Result } from './result.ts'
import { WeddingScope } from './scope.ts'
import { createTasks, type TaskAssigneeRole, type TaskVisibility } from './tasks.ts'

/**
 * Slice S7 of docs/specs/0003-planner-app-screens.md: checklist templates (`task_templates`,
 * `template_items`) and applying one to a wedding.
 *
 * ## Same access shape as the vendor directory
 *
 * Both tables carry `org_id` and no `wedding_id`; their policies admit owner and admin to read
 * and write and `member` to read (0006). A `member` has no org-wide principal, and `withTenant`
 * will not run an `assignedStaff` principal unpinned, so a member reads templates through ONE of
 * their assigned weddings. The pin narrows nothing on these tables; it only satisfies
 * `assertScoped`. Same argument as `vendorDirectoryAccess`, restated instead of imported so a
 * change to the vendor slice cannot silently change who may read a template.
 *
 * ## Copy on apply
 *
 * `applyTemplate` reads the items and hands them to `createTasks` as plain task inputs. Nothing
 * on a task points back at a template, so a later edit or delete cannot reach a wedding. That
 * was a decision of spec 0003; the rejected alternative was a live link, which needs a diff and
 * conflict story for every task a planner has since edited.
 *
 * The read and the insert are two transactions, not one: `createTasks` opens its own, and
 * changing it was ruled out. The cost is that a template edited in the gap between them applies
 * in whichever state the read saw. Nothing is half-applied either way, because the insert is one
 * statement.
 *
 * ## Parent-read rule
 *
 * `template_items.template_id` is a plain foreign key, and a referential-integrity check ignores
 * RLS, so an item could name another organisation's template. Every item write therefore reads
 * the template in the same transaction and refuses when it is not found.
 */

export type TemplateSummary = {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly itemCount: number
}

export type TemplateItemInput = {
  readonly title: string
  /** T-minus as on `tasks`: negative is before the wedding date, so -180 is six months before. */
  readonly dueOffsetDays: number
  readonly visibility: TaskVisibility
  readonly assigneeRole: TaskAssigneeRole
}

export type TemplateItemRow = TemplateItemInput & {
  readonly id: string
  readonly position: number
}

export type TemplateInput = {
  readonly name: string
  readonly description: string | null
}

export type TemplateDetail = {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly items: TemplateItemRow[]
}

export type TemplateWriteResult<T = null> = Result<T, 'forbidden' | 'notFound' | 'empty' | 'full'>

const FORBIDDEN = fail('forbidden')
const NOT_FOUND = fail('notFound')
const EMPTY = fail('empty')
const FULL = fail('full')

/** The form's limit (`TEMPLATE_LIMITS.name` in the app), restated for the copy's name. */
const MAX_NAME = 120

/** Enough for a real plan (the prototype's is 15) and a ceiling on one insert's size. */
export const MAX_TEMPLATE_ITEMS = 300

const ITEM_COLUMNS = {
  id: templateItems.id,
  title: templateItems.title,
  dueOffsetDays: templateItems.dueOffsetDays,
  visibility: templateItems.visibility,
  assigneeRole: templateItems.assigneeRole,
  position: templateItems.position,
}

// The column CHECKs hold the two value lists, so the cast is what the schema already promises.
type ItemSelected = Omit<TemplateItemRow, 'visibility' | 'assigneeRole'> & {
  visibility: string
  assigneeRole: string
}
const toItem = (r: ItemSelected): TemplateItemRow => ({
  ...r,
  visibility: r.visibility as TaskVisibility,
  assigneeRole: r.assigneeRole as TaskAssigneeRole,
})

/**
 * Who may see the templates and whether they may change them.
 *
 * `null` is no standing: not in the org, or a `member` assigned to no wedding. The page renders
 * that as a 404. `canWrite` is the SAME test the policies apply; it lets an action refuse before
 * a query and the UI hide a button, and is not a substitute for RLS.
 */
export function templateAccess(
  m: Memberships,
  orgId: string,
): { readonly principal: Principal; readonly canWrite: boolean } | null {
  const orgWide = principalForOrg(m, orgId)
  if (orgWide) return { principal: orgWide, canWrite: true }

  for (const w of m.weddings) {
    const pinned = principalForWedding(m, orgId, w.weddingId)
    if (pinned?.kind === 'assignedStaff') return { principal: pinned, canWrite: false }
  }
  return null
}

async function loadTemplate(tx: TenantDb, orgId: string, templateId: string) {
  const [row] = await tx
    .select({
      id: taskTemplates.id,
      name: taskTemplates.name,
      description: taskTemplates.description,
    })
    .from(taskTemplates)
    .where(
      and(
        eq(taskTemplates.id, templateId),
        eq(taskTemplates.orgId, orgId),
        isNull(taskTemplates.deletedAt),
      ),
    )
  return row ?? null
}

async function loadItems(tx: TenantDb, orgId: string, templateId: string) {
  const rows = await tx
    .select(ITEM_COLUMNS)
    .from(templateItems)
    .where(and(eq(templateItems.templateId, templateId), eq(templateItems.orgId, orgId)))
    .orderBy(asc(templateItems.position), asc(templateItems.id))
  return rows.map(toItem)
}

/** Every template of the org, alphabetical, with its item count. `null` for no standing. */
export async function listTemplates(
  db: Db,
  m: Memberships,
  orgId: string,
): Promise<{ templates: TemplateSummary[]; canWrite: boolean } | null> {
  const access = templateAccess(m, orgId)
  if (!access) return null

  const templates = await withTenant(db, access.principal, async (tx) => {
    const rows = await tx
      .select({
        id: taskTemplates.id,
        name: taskTemplates.name,
        description: taskTemplates.description,
      })
      .from(taskTemplates)
      .where(and(eq(taskTemplates.orgId, orgId), isNull(taskTemplates.deletedAt)))
      .orderBy(asc(sql`lower(${taskTemplates.name})`), asc(taskTemplates.id))
    if (rows.length === 0) return []

    // A second grouped query and not a correlated subquery in the select list: a subquery that
    // names `id` on both sides depends on how drizzle qualifies columns in a single-table select,
    // and a wrong resolution counts nothing without failing.
    const counts = await tx
      .select({ templateId: templateItems.templateId, n: sql<number>`count(*)::int` })
      .from(templateItems)
      .where(
        and(
          eq(templateItems.orgId, orgId),
          inArray(
            templateItems.templateId,
            rows.map((r) => r.id),
          ),
        ),
      )
      .groupBy(templateItems.templateId)
    const byId = new Map(counts.map((c) => [c.templateId, c.n]))
    return rows.map((r) => ({ ...r, itemCount: byId.get(r.id) ?? 0 }))
  })
  return { templates, canWrite: access.canWrite }
}

/** One template with its items in order, or `null` when there is no standing or no such template. */
export async function getTemplate(
  db: Db,
  m: Memberships,
  orgId: string,
  templateId: string,
): Promise<{ template: TemplateDetail; canWrite: boolean } | null> {
  const access = templateAccess(m, orgId)
  if (!access) return null
  const template = await withTenant(db, access.principal, async (tx) => {
    const head = await loadTemplate(tx, orgId, templateId)
    if (!head) return null
    return { ...head, items: await loadItems(tx, orgId, templateId) }
  })
  return template ? { template, canWrite: access.canWrite } : null
}

export async function createTemplate(
  db: Db,
  m: Memberships,
  orgId: string,
  input: TemplateInput,
): Promise<TemplateWriteResult<{ id: string }>> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return FORBIDDEN
  const id = newId()
  await withTenant(db, principal, async (tx) => {
    await tx.insert(taskTemplates).values({ id, orgId, ...input })
  })
  return ok({ id })
}

export async function updateTemplate(
  db: Db,
  m: Memberships,
  orgId: string,
  templateId: string,
  input: TemplateInput,
): Promise<TemplateWriteResult> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return FORBIDDEN
  const changed = await withTenant(db, principal, async (tx) =>
    tx
      .update(taskTemplates)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(taskTemplates.id, templateId),
          eq(taskTemplates.orgId, orgId),
          isNull(taskTemplates.deletedAt),
        ),
      )
      .returning({ id: taskTemplates.id }),
  )
  return changed.length === 0 ? NOT_FOUND : ok(null)
}

/**
 * Soft delete, like the vendor directory. Nothing refers to a template (tasks are copies), so a
 * hard delete would be safe too; the row is kept so a planner's mistake is one UPDATE away from
 * being undone, and the items go with it by being unreachable, not by cascade.
 */
export async function deleteTemplate(
  db: Db,
  m: Memberships,
  orgId: string,
  templateId: string,
): Promise<TemplateWriteResult> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return FORBIDDEN
  const now = new Date()
  const changed = await withTenant(db, principal, async (tx) =>
    tx
      .update(taskTemplates)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(taskTemplates.id, templateId),
          eq(taskTemplates.orgId, orgId),
          isNull(taskTemplates.deletedAt),
        ),
      )
      .returning({ id: taskTemplates.id }),
  )
  return changed.length === 0 ? NOT_FOUND : ok(null)
}

/**
 * A new template named after the source plus `copySuffix` (" (kopie)"), with a copy of every item
 * in the same order. One transaction. The suffix is an argument and not a constant because it is
 * copy, and this package holds none; the source name is cut to fit `MAX_NAME` so a long name
 * cannot make the copy fail the length check the form enforces.
 */
export async function duplicateTemplate(
  db: Db,
  m: Memberships,
  orgId: string,
  templateId: string,
  copySuffix: string,
): Promise<TemplateWriteResult<{ id: string }>> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return FORBIDDEN
  return withTenant(db, principal, async (tx) => {
    const source = await loadTemplate(tx, orgId, templateId)
    if (!source) return NOT_FOUND
    const items = await loadItems(tx, orgId, templateId)
    const id = newId()
    const name = source.name.slice(0, MAX_NAME - copySuffix.length) + copySuffix
    await tx.insert(taskTemplates).values({ id, orgId, name, description: source.description })
    if (items.length > 0) {
      await tx.insert(templateItems).values(
        items.map((item, position) => ({
          id: newId(),
          orgId,
          templateId: id,
          title: item.title,
          dueOffsetDays: item.dueOffsetDays,
          visibility: item.visibility,
          assigneeRole: item.assigneeRole,
          position,
        })),
      )
    }
    return ok({ id })
  })
}

/** Appended after the last item. `notFound` for a template that is missing, deleted or foreign. */
export async function addTemplateItem(
  db: Db,
  m: Memberships,
  orgId: string,
  templateId: string,
  input: TemplateItemInput,
): Promise<TemplateWriteResult<{ id: string }>> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return FORBIDDEN
  return withTenant(db, principal, async (tx) => {
    if (!(await loadTemplate(tx, orgId, templateId))) return NOT_FOUND
    const [tail] = await tx
      .select({
        last: sql<number | null>`max(${templateItems.position})`,
        n: sql<number>`count(*)::int`,
      })
      .from(templateItems)
      .where(and(eq(templateItems.templateId, templateId), eq(templateItems.orgId, orgId)))
    if ((tail?.n ?? 0) >= MAX_TEMPLATE_ITEMS) return FULL
    const id = newId()
    await tx.insert(templateItems).values({
      id,
      orgId,
      templateId,
      ...input,
      position: tail?.last == null ? 0 : tail.last + 1,
    })
    return ok({ id })
  })
}

export async function updateTemplateItem(
  db: Db,
  m: Memberships,
  orgId: string,
  templateId: string,
  itemId: string,
  input: TemplateItemInput,
): Promise<TemplateWriteResult> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return FORBIDDEN
  return withTenant(db, principal, async (tx) => {
    if (!(await loadTemplate(tx, orgId, templateId))) return NOT_FOUND
    const changed = await tx
      .update(templateItems)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(templateItems.id, itemId),
          eq(templateItems.templateId, templateId),
          eq(templateItems.orgId, orgId),
        ),
      )
      .returning({ id: templateItems.id })
    return changed.length === 0 ? NOT_FOUND : ok(null)
  })
}

export async function deleteTemplateItem(
  db: Db,
  m: Memberships,
  orgId: string,
  templateId: string,
  itemId: string,
): Promise<TemplateWriteResult> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return FORBIDDEN
  return withTenant(db, principal, async (tx) => {
    if (!(await loadTemplate(tx, orgId, templateId))) return NOT_FOUND
    // A hard delete: an item is a row of a plan, not a record anything else refers to.
    const gone = await tx
      .delete(templateItems)
      .where(
        and(
          eq(templateItems.id, itemId),
          eq(templateItems.templateId, templateId),
          eq(templateItems.orgId, orgId),
        ),
      )
      .returning({ id: templateItems.id })
    return gone.length === 0 ? NOT_FOUND : ok(null)
  })
}

/**
 * One step up or down. Every position is rewritten 0..n-1, so a tie left by any other write
 * cannot turn an arrow into a no-op. A move past either end is a success that changes nothing:
 * two clicks racing each other must not turn the second into an error.
 */
export async function moveTemplateItem(
  db: Db,
  m: Memberships,
  orgId: string,
  templateId: string,
  itemId: string,
  direction: 'up' | 'down',
): Promise<TemplateWriteResult> {
  const principal = principalForOrg(m, orgId)
  if (!principal) return FORBIDDEN
  return withTenant(db, principal, async (tx) => {
    if (!(await loadTemplate(tx, orgId, templateId))) return NOT_FOUND
    const items = await loadItems(tx, orgId, templateId)
    const from = items.findIndex((i) => i.id === itemId)
    if (from === -1) return NOT_FOUND
    const to = direction === 'up' ? from - 1 : from + 1
    const a = items[from]
    const b = items[to]
    if (!a || !b) return ok(null)
    const order = items.map((i) => i.id)
    order[from] = b.id
    order[to] = a.id
    const now = new Date()
    for (const [position, id] of order.entries()) {
      // Sequential and only where it changed: each is one indexed UPDATE, and a plan is dozens of
      // rows, not thousands.
      if (items.find((i) => i.id === id)?.position === position) continue
      await tx
        .update(templateItems)
        .set({ position, updatedAt: now })
        .where(and(eq(templateItems.id, id), eq(templateItems.orgId, orgId)))
    }
    return ok(null)
  })
}

/**
 * Copies the template's items onto a wedding as tasks and returns how many. `notFound` for a
 * template the caller cannot read and for a wedding they cannot reach (`createTasks` answers
 * `null` for both a missing wedding and one outside their assignment, one answer for both);
 * `empty` for a template with no items, which would otherwise report success and do nothing.
 *
 * Any staff member may apply: it writes tasks, which a `member` may do on an assigned wedding.
 * Only editing the template is owner and admin.
 */
export async function applyTemplate(
  db: Db,
  m: Memberships,
  orgId: string,
  templateId: string,
  weddingId: string,
): Promise<TemplateWriteResult<{ count: number }>> {
  const access = templateAccess(m, orgId)
  if (!access) return NOT_FOUND
  const items = await withTenant(db, access.principal, async (tx) => {
    if (!(await loadTemplate(tx, orgId, templateId))) return null
    return loadItems(tx, orgId, templateId)
  })
  if (!items) return NOT_FOUND
  if (items.length === 0) return EMPTY

  const ids = await createTasks(
    WeddingScope.of(db, m, orgId, weddingId),
    items.map((item) => ({
      title: item.title,
      visibility: item.visibility,
      assigneeRole: item.assigneeRole,
      due: { kind: 'offset', days: item.dueOffsetDays },
    })),
  )
  return ids.ok ? ok({ count: ids.value.length }) : NOT_FOUND
}
