import 'server-only'
import {
  type CoupleHome,
  type CouplePrincipal,
  coupleBoardImages,
  coupleConfirmImage,
  coupleHome,
  couplePrincipalFor,
  coupleStartImage,
  newId,
} from '@guestnote/db'
import { cache } from 'react'
import { getDb } from './db.ts'
import { currentSession } from './principal.ts'
import { getStorage } from './storage.ts'
import { isUuid } from './uuid.ts'
import { cleanName, type Done, type StartUpload, signObject } from './wedding-files.ts'

/**
 * The couple portal's request-scoped context (spec 0008): who is asking, as a couple of which
 * wedding, and the wedding's home row. `null` when nobody is signed in, the id is not a UUID, or
 * the database says this user is not a couple of that wedding -- the portal's 404, one answer
 * for all three, as on every wedding screen.
 *
 * Pages and Server Functions both call it; a Server Function is a POST to its own route and
 * the layout above the page does not run for it, so each resolves the couple itself.
 *
 * `cache` is per request (React's), never module-level: a warm Lambda would otherwise serve one
 * couple's principal to the next request, which is what `principal.ts` warns about.
 */
export type CoupleContext = {
  readonly principal: CouplePrincipal
  readonly home: CoupleHome
}

export const currentCouple = cache(async (weddingId: unknown): Promise<CoupleContext | null> => {
  if (!isUuid(weddingId)) return null
  const session = await currentSession()
  if (!session) return null
  const principal = await couplePrincipalFor(getDb(), session.userId, weddingId)
  if (!principal) return null
  const home = await coupleHome(getDb(), principal)
  return home ? { principal, home } : null
})

/** A couple write is allowed only on a live wedding; the database refuses anyway. */
export const writable = (c: CoupleContext) => c.home.status === 'live'

export type PortalImage = {
  readonly id: string
  readonly name: string
  /** Inline, five minutes; `null` when signing failed. */
  readonly url: string | null
  readonly addedBy: string | null
  readonly isOwn: boolean
  readonly commentCount: number
}

/**
 * A shared board's images, signed for this couple's wedding. The keys come from
 * `couple_board_images`, which has just checked the board is shared with them, and
 * `signObject` checks each key is inside this wedding before it signs.
 */
export async function portalBoardImages(c: CoupleContext, boardId: string): Promise<PortalImage[]> {
  if (!isUuid(boardId)) return []
  const rows = await coupleBoardImages(getDb(), c.principal, boardId)
  const scope = { orgId: c.principal.orgId, weddingId: c.principal.weddingId }
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      url: await signObject(scope, r, 'inline'),
      addedBy: r.byCouple ? r.uploaderName : null,
      isOwn: r.isOwn,
      commentCount: r.commentCount,
    })),
  )
}

/**
 * Step one of a couple's upload, the moodboard's shape (`lib/wedding-files.ts` `startUpload`):
 * sign first, so a refused type or size leaves nothing behind, then the hidden row through
 * `couple_start_image`, which refuses a board not shared with them and a key not exactly
 * `<org>/<wedding>/<file>`.
 */
export async function startCoupleUpload(
  c: CoupleContext,
  boardId: unknown,
  input: { name: unknown; mime: unknown; sizeBytes: unknown },
): Promise<StartUpload> {
  if (!isUuid(boardId) || !writable(c)) return { ok: false, error: 'notFound' }
  const name = cleanName(input.name)
  if (!name) return { ok: false, error: 'invalidName' }
  if (typeof input.mime !== 'string' || typeof input.sizeBytes !== 'number') {
    return { ok: false, error: 'invalidSize' }
  }
  const fileId = newId()
  const signed = await getStorage().presignUpload({
    scope: { orgId: c.principal.orgId, weddingId: c.principal.weddingId },
    fileId,
    kind: 'image',
    contentType: input.mime,
    sizeBytes: input.sizeBytes,
  })
  if (!signed.ok) return { ok: false, error: signed.failure }

  const made = await coupleStartImage(getDb(), c.principal, {
    id: fileId,
    moodboardId: boardId,
    name,
    storageKey: signed.key,
    sizeBytes: input.sizeBytes,
    mime: signed.headers['Content-Type'] ?? input.mime,
  })
  if (!made.ok) return { ok: false, error: 'notFound' }
  const { 'Content-Length': _length, ...headers } = signed.headers
  return { ok: true, fileId, url: signed.url, headers }
}

export async function confirmCoupleUpload(c: CoupleContext, fileId: unknown): Promise<Done> {
  if (!isUuid(fileId)) return { ok: false, error: 'notFound' }
  const r = await coupleConfirmImage(getDb(), c.principal, fileId)
  return r.ok ? { ok: true } : { ok: false, error: 'notFound' }
}

/**
 * The module's page, or a 404 when the planner switched it off -- the same answer as a page that
 * does not exist, so a bookmarked budget link does not announce that there is a budget. The
 * database functions check the switch too; this is the page not rendering an empty shell.
 */
export async function coupleModule(
  weddingId: unknown,
  module: CoupleHome['modules'][number],
): Promise<CoupleContext | null> {
  const c = await currentCouple(weddingId)
  if (!c || c.home.status === 'draft' || !c.home.modules.includes(module)) return null
  return c
}

/** A task's stored due instant as the civil date it stands for (noon UTC, spec 0004). */
export const dueCivil = (dueAt: Date | null): string | null =>
  dueAt ? dueAt.toISOString().slice(0, 10) : null
