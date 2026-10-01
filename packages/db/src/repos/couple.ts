import { and, asc, count, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import type { Db, TenantDb } from '../client.ts'
import { newId } from '../id.ts'
import {
  COUPLE_MODULES,
  fileComments,
  files,
  invitations,
  taskComments,
  tasks,
  users,
  weddings,
} from '../schema/index.ts'
import { type Principal, withTenant, withUser } from '../tenant.ts'
import { fail, ok, type Result } from './result.ts'
import type { WeddingScope } from './scope.ts'

/**
 * Spec 0008: the couple portal, both sides of it.
 *
 * ## The couple's side reads through functions
 *
 * A couple principal reads `tasks` and `task_comments` under their `couple_read` policy, and
 * everything else through the `couple_*` SECURITY DEFINER functions of migration 0013, which
 * return named columns (no `notes` anywhere) and check the wedding's status and module switch
 * themselves. Since 0013 a couple reads no `weddings` row at all, so its `orgId` comes from
 * `my_couple_weddings()` -- the gap `principalForWedding`'s comment used to leave to "P7".
 *
 * The portal builds its couple principal only through `couplePrincipalFor`, from a row that
 * function returned for this user, never from input. That is a convention: `CouplePrincipal` is
 * the plain `weddingMember` shape, and `principalForWedding` can build one too. What actually
 * holds the line is the database -- every `couple_*` function re-reads the `couple` membership
 * for `app.user_id` and does not trust `app.wedding_role`.
 *
 * ## The staff side takes a WeddingScope
 *
 * Invite, resend, revoke, remove, the module switches and the unread dot. Owner, admin, or the
 * member assigned to the wedding -- exactly `WeddingScope.principal`'s set. Reading the partner
 * list and removing one go through functions too (`wedding_couple_members`,
 * `remove_wedding_couple`), because an assigned member cannot read other users'
 * `wedding_members` rows under any policy.
 */

export type CoupleModule = (typeof COUPLE_MODULES)[number]
export type WeddingStatus = 'draft' | 'live' | 'archived'
export type CouplePrincipal = Extract<Principal, { kind: 'weddingMember' }> & { role: 'couple' }

async function rowsOf<T>(pending: Promise<unknown>): Promise<T[]> {
  return ((await pending) as { rows: T[] }).rows
}

const asStatus = (s: string): WeddingStatus => {
  if (s === 'draft' || s === 'live' || s === 'archived') return s
  throw new Error(`couple: unknown wedding status '${s}' (schema/weddings.ts)`)
}

const asModules = (m: readonly string[]): CoupleModule[] =>
  m.filter((x): x is CoupleModule => (COUPLE_MODULES as readonly string[]).includes(x))

// ---------------------------------------------------------------- couple ----

export type CoupleWedding = {
  readonly weddingId: string
  readonly orgId: string
  readonly coupleDisplayName: string
  readonly weddingDate: string | null
  readonly status: WeddingStatus
}

/** Every wedding this user is a couple of, soonest first. `withUser`: no tenant yet. */
export async function myCoupleWeddings(db: Db, userId: string): Promise<CoupleWedding[]> {
  const rows = await withUser(db, userId, (tx: TenantDb) =>
    rowsOf<{
      wedding_id: string
      org_id: string
      couple_display_name: string
      wedding_date: string | null
      status: string
    }>(
      tx.execute(
        sql`select wedding_id, org_id, couple_display_name, wedding_date::text as wedding_date, status
              from public.my_couple_weddings()`,
      ),
    ),
  )
  return rows.map((r) => ({
    weddingId: r.wedding_id,
    orgId: r.org_id,
    coupleDisplayName: r.couple_display_name,
    weddingDate: r.wedding_date,
    status: asStatus(r.status),
  }))
}

/**
 * The couple principal for this user on this wedding, or `null`. The only place one is built.
 * `weddingId` may be any string from a URL: it is matched against the database's answer, not
 * trusted.
 */
export async function couplePrincipalFor(
  db: Db,
  userId: string,
  weddingId: string,
): Promise<CouplePrincipal | null> {
  const mine = (await myCoupleWeddings(db, userId)).find((w) => w.weddingId === weddingId)
  if (!mine) return null
  return { kind: 'weddingMember', userId, orgId: mine.orgId, weddingId, role: 'couple' }
}

export type CoupleHome = {
  readonly weddingId: string
  readonly coupleDisplayName: string
  readonly weddingDate: string | null
  readonly venue: string | null
  readonly status: WeddingStatus
  readonly localeDefault: string
  readonly timezone: string
  readonly modules: readonly CoupleModule[]
  readonly studioName: string
  readonly contact: { readonly name: string | null; readonly email: string } | null
  /** Both partners' user ids, for "is this task ours". */
  readonly coupleUserIds: readonly string[]
}

export async function coupleHome(db: Db, p: CouplePrincipal): Promise<CoupleHome | null> {
  const [r] = await withTenant(db, p, (tx) =>
    rowsOf<{
      wedding_id: string
      couple_display_name: string
      wedding_date: string | null
      venue: string | null
      status: string
      locale_default: string
      timezone: string
      couple_modules: string[]
      studio_name: string
      contact_name: string | null
      contact_email: string | null
      couple_user_ids: string[]
    }>(
      tx.execute(
        sql`select wedding_id, couple_display_name, wedding_date::text as wedding_date, venue,
                   status, locale_default, timezone, couple_modules, studio_name, contact_name,
                   contact_email, couple_user_ids
              from public.couple_home()`,
      ),
    ),
  )
  if (!r) return null
  return {
    weddingId: r.wedding_id,
    coupleDisplayName: r.couple_display_name,
    weddingDate: r.wedding_date,
    venue: r.venue,
    status: asStatus(r.status),
    localeDefault: r.locale_default,
    timezone: r.timezone,
    modules: asModules(r.couple_modules),
    studioName: r.studio_name,
    contact: r.contact_email ? { name: r.contact_name, email: r.contact_email } : null,
    coupleUserIds: r.couple_user_ids,
  }
}

export type CoupleTask = {
  readonly id: string
  readonly title: string
  readonly notes: string | null
  readonly dueAt: Date | null
  readonly done: boolean
  /** Assigned to the couple (by role, or to either partner by name): they may tick it. */
  readonly ours: boolean
  readonly commentCount: number
}

/**
 * The shared plan, through `couple_read`. Ordered by due date, undated last. "Ours" is worked
 * out here from `coupleUserIds` rather than in SQL so the rule sits beside its only reader;
 * `couple_set_task_done` holds the same rule in the database, which is the one that counts.
 */
export async function coupleTasks(
  db: Db,
  p: CouplePrincipal,
  coupleUserIds: readonly string[],
): Promise<CoupleTask[]> {
  const rows = await withTenant(db, p, (tx) =>
    tx
      .select({
        id: tasks.id,
        title: tasks.title,
        notes: tasks.notes,
        dueAt: tasks.dueAt,
        status: tasks.status,
        assigneeRole: tasks.assigneeRole,
        assigneeUserId: tasks.assigneeUserId,
        commentCount: sql<number>`(select count(*)::int from ${taskComments} c
                                    where c.task_id = ${tasks.id} and c.deleted_at is null)`,
      })
      .from(tasks)
      .where(and(eq(tasks.weddingId, p.weddingId), isNull(tasks.deletedAt)))
      .orderBy(sql`${tasks.dueAt} asc nulls last`, asc(tasks.title), asc(tasks.id)),
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    dueAt: r.dueAt,
    done: r.status === 'done',
    ours:
      r.assigneeRole === 'couple' ||
      (r.assigneeUserId !== null && coupleUserIds.includes(r.assigneeUserId)),
    commentCount: Number(r.commentCount),
  }))
}

export type CoupleComment = {
  readonly id: string
  readonly authorName: string | null
  readonly byCouple: boolean
  readonly isOwn: boolean
  readonly body: string
  readonly createdAt: Date
}

export async function coupleTaskComments(
  db: Db,
  p: CouplePrincipal,
  taskId: string,
  coupleUserIds: readonly string[],
): Promise<CoupleComment[]> {
  const rows = await withTenant(db, p, (tx) =>
    tx
      .select({
        id: taskComments.id,
        authorUserId: taskComments.authorUserId,
        authorName: users.name,
        authorEmail: users.email,
        body: taskComments.body,
        createdAt: taskComments.createdAt,
      })
      .from(taskComments)
      .leftJoin(users, eq(users.id, taskComments.authorUserId))
      .where(
        and(
          eq(taskComments.taskId, taskId),
          eq(taskComments.weddingId, p.weddingId),
          isNull(taskComments.deletedAt),
        ),
      )
      .orderBy(asc(taskComments.createdAt), asc(taskComments.id)),
  )
  return rows.map((r) => {
    const byCouple = r.authorUserId !== null && coupleUserIds.includes(r.authorUserId)
    return {
      id: r.id,
      // A partner's address when they have no name (an invited account has none until asked);
      // staff never -- the caller shows the studio for a nameless planner. Same rule as the
      // SQL functions' `author_name`.
      authorName: (r.authorName?.trim() || null) ?? (byCouple ? r.authorEmail : null),
      byCouple,
      isOwn: r.authorUserId === p.userId,
      body: r.body,
      createdAt: r.createdAt,
    }
  })
}

export type CoupleRunSheetRow = {
  readonly id: string
  readonly eventId: string
  readonly eventLabel: string
  readonly eventStartsOn: string
  readonly startsAt: string
  readonly durationMin: number
  readonly title: string
  readonly place: string | null
  readonly vendorName: string | null
}

export async function coupleRunSheet(db: Db, p: CouplePrincipal): Promise<CoupleRunSheetRow[]> {
  const rows = await withTenant(db, p, (tx) =>
    rowsOf<{
      id: string
      event_id: string
      event_label: string
      event_starts_on: string
      starts_at: string
      duration_min: number
      title: string
      place: string | null
      vendor_name: string | null
    }>(
      tx.execute(
        sql`select id, event_id, event_label, event_starts_on::text as event_starts_on, starts_at,
                   duration_min, title, place, vendor_name
              from public.couple_run_sheet()`,
      ),
    ),
  )
  return rows.map((r) => ({
    id: r.id,
    eventId: r.event_id,
    eventLabel: r.event_label,
    eventStartsOn: r.event_starts_on,
    startsAt: r.starts_at,
    durationMin: r.duration_min,
    title: r.title,
    place: r.place,
    vendorName: r.vendor_name,
  }))
}

export type CoupleVendor = { readonly id: string; readonly name: string; readonly category: string }

export async function coupleVendors(db: Db, p: CouplePrincipal): Promise<CoupleVendor[]> {
  return withTenant(db, p, (tx) =>
    rowsOf<CoupleVendor>(tx.execute(sql`select id, name, category from public.couple_vendors()`)),
  )
}

export type CoupleBudget = {
  readonly lines: readonly {
    readonly id: string
    readonly category: string
    readonly label: string
    readonly estimateCents: number
    readonly actualCents: number | null
  }[]
  readonly payments: readonly {
    readonly id: string
    readonly budgetLineId: string
    readonly label: string
    readonly dueOn: string
    readonly amountCents: number
    readonly paid: boolean
  }[]
}

export async function coupleBudget(db: Db, p: CouplePrincipal): Promise<CoupleBudget> {
  return withTenant(db, p, async (tx) => {
    const lines = await rowsOf<{
      id: string
      category: string
      label: string
      estimate_cents: number
      actual_cents: number | null
    }>(tx.execute(sql`select * from public.couple_budget_lines()`))
    const payments = await rowsOf<{
      id: string
      budget_line_id: string
      label: string
      due_on: string
      amount_cents: number
      paid_at: unknown
    }>(
      tx.execute(
        sql`select id, budget_line_id, label, due_on::text as due_on, amount_cents, paid_at
              from public.couple_payments()`,
      ),
    )
    return {
      lines: lines.map((l) => ({
        id: l.id,
        category: l.category,
        label: l.label,
        estimateCents: l.estimate_cents,
        actualCents: l.actual_cents,
      })),
      payments: payments.map((x) => ({
        id: x.id,
        budgetLineId: x.budget_line_id,
        label: x.label,
        dueOn: x.due_on,
        amountCents: x.amount_cents,
        paid: x.paid_at !== null,
      })),
    }
  })
}

export type CoupleBoard = {
  readonly id: string
  readonly name: string
  readonly isDefault: boolean
  readonly imageCount: number
}

export async function coupleMoodboards(db: Db, p: CouplePrincipal): Promise<CoupleBoard[]> {
  const rows = await withTenant(db, p, (tx) =>
    rowsOf<{ id: string; name: string; is_default: boolean; image_count: number }>(
      tx.execute(sql`select * from public.couple_moodboards()`),
    ),
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isDefault: r.is_default,
    imageCount: r.image_count,
  }))
}

/** `storageKey` is for the server to presign a GET with; it never goes to a browser. */
export type CoupleImage = {
  readonly id: string
  readonly name: string
  readonly storageKey: string
  readonly mime: string
  readonly uploaderName: string | null
  readonly byCouple: boolean
  readonly isOwn: boolean
  readonly commentCount: number
}

export async function coupleBoardImages(
  db: Db,
  p: CouplePrincipal,
  moodboardId: string,
): Promise<CoupleImage[]> {
  const rows = await withTenant(db, p, (tx) =>
    rowsOf<{
      id: string
      name: string
      storage_key: string
      mime: string
      uploader_name: string | null
      by_couple: boolean
      is_own: boolean
      comment_count: number
    }>(tx.execute(sql`select * from public.couple_board_images(${moodboardId}::uuid)`)),
  )
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    storageKey: r.storage_key,
    mime: r.mime,
    uploaderName: r.uploader_name,
    byCouple: r.by_couple,
    isOwn: r.is_own,
    commentCount: r.comment_count,
  }))
}

export async function coupleFileComments(
  db: Db,
  p: CouplePrincipal,
  fileId: string,
): Promise<CoupleComment[]> {
  const rows = await withTenant(db, p, (tx) =>
    rowsOf<{
      id: string
      author_name: string | null
      by_couple: boolean
      is_own: boolean
      body: string
      created_at: Date | string
    }>(tx.execute(sql`select * from public.couple_file_comments(${fileId}::uuid)`)),
  )
  return rows.map((r) => ({
    id: r.id,
    authorName: r.author_name,
    byCouple: r.by_couple,
    isOwn: r.is_own,
    body: r.body,
    createdAt: new Date(r.created_at),
  }))
}

/** One boolean-returning couple function, mapped to the repo's write vocabulary. */
async function coupleWrite(
  db: Db,
  p: CouplePrincipal,
  call: ReturnType<typeof sql>,
): Promise<Result<null, 'notFound'>> {
  const [row] = await withTenant(db, p, (tx) => rowsOf<{ done: boolean }>(tx.execute(call)))
  return row?.done ? ok(null) : fail('notFound')
}

export const coupleSetTaskDone = (db: Db, p: CouplePrincipal, taskId: string, done: boolean) =>
  coupleWrite(db, p, sql`select public.couple_set_task_done(${taskId}::uuid, ${done}) as done`)

export const coupleAddTaskComment = (db: Db, p: CouplePrincipal, taskId: string, body: string) =>
  coupleWrite(
    db,
    p,
    sql`select public.couple_add_task_comment(${newId()}::uuid, ${taskId}::uuid, ${body}) as done`,
  )

export const coupleDeleteTaskComment = (db: Db, p: CouplePrincipal, commentId: string) =>
  coupleWrite(db, p, sql`select public.couple_delete_task_comment(${commentId}::uuid) as done`)

/** Step one of a couple upload: the hidden row, `deleted_at = created_at` (repos/files.ts). */
export const coupleStartImage = (
  db: Db,
  p: CouplePrincipal,
  input: {
    readonly id: string
    readonly moodboardId: string
    readonly name: string
    readonly storageKey: string
    readonly sizeBytes: number
    readonly mime: string
  },
) =>
  coupleWrite(
    db,
    p,
    sql`select public.couple_start_image(${input.id}::uuid, ${input.moodboardId}::uuid,
          ${input.name}, ${input.storageKey}, ${input.sizeBytes}::bigint, ${input.mime}) as done`,
  )

export const coupleConfirmImage = (db: Db, p: CouplePrincipal, fileId: string) =>
  coupleWrite(db, p, sql`select public.couple_confirm_image(${fileId}::uuid) as done`)

export const coupleDeleteImage = (db: Db, p: CouplePrincipal, fileId: string) =>
  coupleWrite(db, p, sql`select public.couple_delete_image(${fileId}::uuid) as done`)

export const coupleAddFileComment = (db: Db, p: CouplePrincipal, fileId: string, body: string) =>
  coupleWrite(
    db,
    p,
    sql`select public.couple_add_file_comment(${newId()}::uuid, ${fileId}::uuid, ${body}) as done`,
  )

export const coupleDeleteFileComment = (db: Db, p: CouplePrincipal, commentId: string) =>
  coupleWrite(db, p, sql`select public.couple_delete_file_comment(${commentId}::uuid) as done`)

// ----------------------------------------------------------------- staff ----

export type CoupleAccess = {
  readonly coupleDisplayName: string
  /** The language the couple's invitation is written in (spec 0008). */
  readonly localeDefault: string
  readonly modules: readonly CoupleModule[]
  readonly partners: readonly {
    readonly userId: string
    readonly name: string | null
    readonly email: string
    readonly joinedAt: Date
  }[]
  readonly invites: readonly {
    readonly id: string
    readonly email: string
    readonly sentAt: Date
    readonly expiresAt: Date
    readonly expired: boolean
  }[]
  /** Shared, live tasks: what the invite card says the couple will see. */
  readonly sharedTaskCount: number
}

/** The couple section of one wedding, or `null` for anyone who may not manage it. */
export async function getCoupleAccess(scope: WeddingScope): Promise<CoupleAccess | null> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return null

  return withTenant(db, principal, async (tx) => {
    const [wedding] = await tx
      .select({
        modules: weddings.coupleModules,
        coupleDisplayName: weddings.coupleDisplayName,
        localeDefault: weddings.localeDefault,
      })
      .from(weddings)
      .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
    if (!wedding) return null

    const partners = await rowsOf<{
      user_id: string
      name: string | null
      email: string
      joined_at: Date | string
    }>(tx.execute(sql`select * from public.wedding_couple_members(${weddingId}::uuid)`))

    // `role = 'couple'` and this wedding, explicitly: the policy admits every invite of the
    // wedding to its staff, editor invites included, should those ever exist.
    const invites = await tx
      .select({
        id: invitations.id,
        email: invitations.email,
        sentAt: invitations.createdAt,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(
        and(
          eq(invitations.weddingId, weddingId),
          eq(invitations.role, 'couple'),
          isNull(invitations.acceptedAt),
        ),
      )
      .orderBy(asc(invitations.createdAt), asc(invitations.id))

    const [shared] = await tx
      .select({ n: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.weddingId, weddingId),
          eq(tasks.visibility, 'shared'),
          isNull(tasks.deletedAt),
        ),
      )

    const now = Date.now()
    return {
      coupleDisplayName: wedding.coupleDisplayName,
      localeDefault: wedding.localeDefault,
      modules: asModules(wedding.modules),
      partners: partners.map((r) => ({
        userId: r.user_id,
        name: r.name,
        email: r.email,
        joinedAt: new Date(r.joined_at),
      })),
      invites: invites.map((i) => ({ ...i, expired: i.expiresAt.getTime() <= now })),
      sharedTaskCount: Number(shared?.n ?? 0),
    }
  })
}

export type CoupleInviteRefusal =
  | 'forbidden'
  | 'alreadyStaff'
  | 'alreadyPartner'
  | 'duplicate'
  | 'full'

/**
 * At most two partners, counting accepted ones and live invites (spec 0008, Inviting). Rejected:
 * no cap -- a parent or a witness with portal access is a grant nobody decided on. Cost: a third
 * person is told no.
 */
export const COUPLE_MAX = 2

/**
 * Creates a couple invitation. `email` must already be trimmed and lower-cased, as for
 * `createStaffInvite`. `duplicate` is a live pending couple invite for the same address on this
 * wedding; an expired one does not block (resend is the way to renew it, and a fresh invite does
 * the same job). As with staff invites, two simultaneous sends can both win -- no unique index.
 */
export async function createCoupleInvite(
  scope: WeddingScope,
  input: { readonly email: string; readonly tokenHash: string; readonly expiresAt: Date },
): Promise<Result<{ id: string }, CoupleInviteRefusal>> {
  const { db, orgId, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('forbidden')

  return withTenant(db, principal, async (tx) => {
    const [b] = await rowsOf<{ b: string | null }>(
      tx.execute(sql`select public.couple_invite_blocker(${weddingId}::uuid, ${input.email}) as b`),
    )
    const blocker = b?.b
    if (blocker === 'forbidden' || blocker === 'alreadyStaff' || blocker === 'alreadyPartner') {
      return fail(blocker)
    }

    const [live] = await tx
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.weddingId, weddingId),
          eq(invitations.role, 'couple'),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
          sql`lower(${invitations.email}) = ${input.email}`,
        ),
      )
      .limit(1)
    if (live) return fail('duplicate')

    // A third partner is refused: two accepted, or one and a live invite, fill the wedding. An
    // expired invite frees its slot. Same race as `duplicate`, same cost.
    const [partners] = await rowsOf<{ n: number }>(
      tx.execute(
        sql`select count(*)::int as n from public.wedding_couple_members(${weddingId}::uuid)`,
      ),
    )
    const [pending] = await tx
      .select({ n: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.weddingId, weddingId),
          eq(invitations.role, 'couple'),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
    if (Number(partners?.n ?? 0) + Number(pending?.n ?? 0) >= COUPLE_MAX) return fail('full')

    const id = newId()
    await tx.insert(invitations).values({
      id,
      orgId,
      weddingId,
      email: input.email,
      role: 'couple',
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      invitedBy: principal.userId,
    })
    return ok({ id })
  })
}

/**
 * Replaces a pending couple invite with a fresh token and expiry, in one transaction: the old row
 * is deleted (its token then resolves `unknown`, 0007) and a new one written for the same address.
 * Returns the address so the caller can mail it.
 */
export async function renewCoupleInvite(
  scope: WeddingScope,
  invitationId: string,
  input: { readonly tokenHash: string; readonly expiresAt: Date },
): Promise<Result<{ id: string; email: string }, 'notFound'>> {
  const { db, orgId, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx) => {
    const [gone] = await tx
      .delete(invitations)
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.weddingId, weddingId),
          eq(invitations.role, 'couple'),
          isNull(invitations.acceptedAt),
        ),
      )
      .returning({ email: invitations.email })
    if (!gone) return fail('notFound')

    const id = newId()
    await tx.insert(invitations).values({
      id,
      orgId,
      weddingId,
      email: gone.email,
      role: 'couple',
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      invitedBy: principal.userId,
    })
    return ok({ id, email: gone.email })
  })
}

export async function revokeCoupleInvite(
  scope: WeddingScope,
  invitationId: string,
): Promise<Result<null, 'notFound'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  const gone = await withTenant(db, principal, (tx) =>
    tx
      .delete(invitations)
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.weddingId, weddingId),
          eq(invitations.role, 'couple'),
          isNull(invitations.acceptedAt),
        ),
      )
      .returning({ id: invitations.id }),
  )
  return gone.length > 0 ? ok(null) : fail('notFound')
}

export async function removeCouplePartner(
  scope: WeddingScope,
  userId: string,
): Promise<Result<null, 'notFound'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  const [row] = await withTenant(db, principal, (tx) =>
    rowsOf<{ done: boolean }>(
      tx.execute(
        sql`select public.remove_wedding_couple(${weddingId}::uuid, ${userId}::uuid) as done`,
      ),
    ),
  )
  return row?.done ? ok(null) : fail('notFound')
}

/** Replaces the module switches. Unknown values are dropped before the CHECK would refuse them. */
export async function setCoupleModules(
  scope: WeddingScope,
  modules: readonly string[],
): Promise<Result<null, 'notFound'>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  const next = COUPLE_MODULES.filter((m) => modules.includes(m))
  const changed = await withTenant(db, principal, (tx) =>
    tx
      .update(weddings)
      .set({ coupleModules: [...next], updatedAt: new Date() })
      .where(and(eq(weddings.id, weddingId), isNull(weddings.deletedAt)))
      .returning({ id: weddings.id }),
  )
  return changed.length > 0 ? ok(null) : fail('notFound')
}

/**
 * Clears the planner's unread dot on a task or an image (spec 0008): shared by the team, so any
 * staff member opening it clears it for all. A no-op, not a failure, when nothing was unread.
 */
export async function markCoupleActivitySeen(
  scope: WeddingScope,
  subject: { readonly kind: 'task' | 'file'; readonly id: string },
): Promise<void> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return
  const table = subject.kind === 'task' ? sql`public.tasks` : sql`public.files`
  await withTenant(db, principal, (tx) =>
    tx.execute(
      sql`update ${table} set staff_seen_at = now()
           where id = ${subject.id}::uuid and wedding_id = ${weddingId}::uuid
             and couple_activity_at is not null
             and (staff_seen_at is null or staff_seen_at < couple_activity_at)`,
    ),
  )
}

// ------------------------------------------------------ staff: images ----

/** What the planner's board shows about the couple on each image (spec 0008). */
export type ImageCoupleInfo = {
  readonly uploadedBy: string | null
  readonly uploaderName: string | null
  readonly coupleUnread: boolean
  readonly commentCount: number
}

/**
 * Per image of a board: who added it, whether the couple did something the team has not seen,
 * and how many comments it has. `{}` for anyone without standing. Whether the uploader IS the
 * couple is for the caller to decide against `getCoupleAccess(...).partners`, which this does
 * not read twice.
 */
export async function imageCoupleInfo(
  scope: WeddingScope,
  fileIds: readonly string[],
): Promise<Readonly<Record<string, ImageCoupleInfo>>> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal || fileIds.length === 0) return {}

  const rows = await withTenant(db, principal, (tx) =>
    tx
      .select({
        id: files.id,
        uploadedBy: files.uploadedBy,
        uploaderName: sql<string | null>`coalesce(nullif(${users.name}, ''), ${users.email})`,
        unread: sql<boolean>`${files.coupleActivityAt} is not null
          and (${files.staffSeenAt} is null or ${files.staffSeenAt} < ${files.coupleActivityAt})`,
        commentCount: sql<number>`(select count(*)::int from ${fileComments} c
                                    where c.file_id = ${files.id} and c.deleted_at is null)`,
      })
      .from(files)
      .leftJoin(users, eq(users.id, files.uploadedBy))
      .where(and(eq(files.weddingId, weddingId), inArray(files.id, [...fileIds]))),
  )
  return Object.fromEntries(
    rows.map((r) => [
      r.id,
      {
        uploadedBy: r.uploadedBy,
        uploaderName: r.uploaderName,
        coupleUnread: Boolean(r.unread),
        commentCount: Number(r.commentCount),
      },
    ]),
  )
}

export type ImageComment = {
  readonly id: string
  readonly authorUserId: string | null
  readonly authorName: string | null
  readonly body: string
  readonly createdAt: Date
}

/** An image's thread for staff, oldest first. `null` for no standing or an image not here. */
export async function listImageComments(
  scope: WeddingScope,
  fileId: string,
): Promise<ImageComment[] | null> {
  const { db, weddingId } = scope
  const principal = scope.principal
  if (!principal) return null

  return withTenant(db, principal, async (tx) => {
    const [image] = await tx
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.weddingId, weddingId), eq(files.kind, 'image')))
    if (!image) return null
    return tx
      .select({
        id: fileComments.id,
        authorUserId: fileComments.authorUserId,
        authorName: sql<string | null>`coalesce(nullif(${users.name}, ''), ${users.email})`,
        body: fileComments.body,
        createdAt: fileComments.createdAt,
      })
      .from(fileComments)
      .leftJoin(users, eq(users.id, fileComments.authorUserId))
      .where(
        and(
          eq(fileComments.fileId, fileId),
          eq(fileComments.weddingId, weddingId),
          isNull(fileComments.deletedAt),
        ),
      )
      .orderBy(asc(fileComments.createdAt), asc(fileComments.id))
  })
}

/**
 * A staff comment on an image. The image is read under the same wedding filter first: the FK
 * from `file_comments.file_id` is plain, and the policy says nothing about whose wedding the id
 * names (spec 0003, "Shared rules"). `body` must already be trimmed and within `COMMENT_MAX`.
 */
export async function addImageComment(
  scope: WeddingScope,
  fileId: string,
  body: string,
): Promise<Result<null, 'notFound'>> {
  const { db, orgId, weddingId } = scope
  const principal = scope.principal
  if (!principal) return fail('notFound')

  return withTenant(db, principal, async (tx) => {
    const [image] = await tx
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.weddingId, weddingId),
          eq(files.kind, 'image'),
          isNull(files.deletedAt),
        ),
      )
    if (!image) return fail('notFound')
    await tx.insert(fileComments).values({
      id: newId(),
      orgId,
      weddingId,
      fileId,
      authorUserId: principal.userId,
      body,
    })
    return ok(null)
  })
}
