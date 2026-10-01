'use server'

import {
  coupleAddFileComment,
  coupleAddTaskComment,
  coupleDeleteFileComment,
  coupleDeleteImage,
  coupleDeleteTaskComment,
  coupleFileComments,
  coupleSetTaskDone,
  coupleTaskComments,
} from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ThreadComment } from '../../../../../components/couple/comment-thread.tsx'
import {
  confirmCoupleUpload,
  currentCouple,
  startCoupleUpload,
  writable,
} from '../../../../../lib/couple.ts'
import { getDb } from '../../../../../lib/db.ts'
import { COMMENT_MAX } from '../../../../../lib/task-form.ts'
import { isUuid } from '../../../../../lib/uuid.ts'
import type { Done, StartUpload } from '../../../../../lib/wedding-files.ts'

/**
 * The couple's Server Functions (spec 0008). Each resolves the couple itself from the session and
 * the wedding id -- a Server Function is a POST to its own route, and the portal layout does not
 * run for it -- and each write goes through one `couple_*` SECURITY DEFINER function that checks
 * again, in the database, that the wedding is live, the module is on and the row is theirs.
 *
 * Outside `app/pro/(app)/`, so the trial guard does not scan these, and must not: spec 0005 says
 * a couple keeps writing after the studio's trial ends.
 */

const refresh = (weddingId: string) => revalidatePath(`/pro/w/${weddingId}`, 'layout')

const cleanBody = (raw: unknown): string | null => {
  const text = String(raw ?? '').trim()
  return text && text.length <= COMMENT_MAX ? text : null
}

export async function tickTask(weddingId: string, taskId: string, done: boolean): Promise<boolean> {
  const c = await currentCouple(weddingId)
  if (!c || !isUuid(taskId) || typeof done !== 'boolean') return false
  const r = await coupleSetTaskDone(getDb(), c.principal, taskId, done)
  if (r.ok) refresh(weddingId)
  return r.ok
}

async function formatThread(
  rows: readonly {
    id: string
    authorName: string | null
    byCouple: boolean
    isOwn: boolean
    body: string
    createdAt: Date
  }[],
  studio: string,
): Promise<ThreadComment[]> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('app.couple.portal')])
  const labels = { you: t('you'), unknown: t('unknownAuthor') }
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    // Belgium, as `i18n/request.ts` gives every `useFormatter`: the server runs in UTC.
    timeZone: 'Europe/Brussels',
  })
  return rows.map((r) => ({
    id: r.id,
    // A nameless planner is the studio to the couple; `unknown` is for a deleted account.
    author: r.isOwn ? labels.you : (r.authorName ?? (r.byCouple ? labels.unknown : studio)),
    byCouple: r.byCouple,
    isOwn: r.isOwn,
    body: r.body,
    when: when.format(r.createdAt),
  }))
}

export async function taskThread(
  weddingId: string,
  taskId: string,
): Promise<ThreadComment[] | null> {
  const c = await currentCouple(weddingId)
  if (!c || !isUuid(taskId)) return null
  const rows = await coupleTaskComments(getDb(), c.principal, taskId, c.home.coupleUserIds)
  return formatThread(rows, c.home.studioName)
}

export async function addTaskComment(
  weddingId: string,
  taskId: string,
  body: string,
): Promise<boolean> {
  const c = await currentCouple(weddingId)
  const text = cleanBody(body)
  if (!c || !isUuid(taskId) || !text) return false
  const r = await coupleAddTaskComment(getDb(), c.principal, taskId, text)
  if (r.ok) refresh(weddingId)
  return r.ok
}

export async function deleteTaskComment(weddingId: string, commentId: string): Promise<boolean> {
  const c = await currentCouple(weddingId)
  if (!c || !isUuid(commentId)) return false
  const r = await coupleDeleteTaskComment(getDb(), c.principal, commentId)
  if (r.ok) refresh(weddingId)
  return r.ok
}

export async function imageThread(
  weddingId: string,
  fileId: string,
): Promise<ThreadComment[] | null> {
  const c = await currentCouple(weddingId)
  if (!c || !isUuid(fileId)) return null
  return formatThread(await coupleFileComments(getDb(), c.principal, fileId), c.home.studioName)
}

export async function addImageComment(
  weddingId: string,
  fileId: string,
  body: string,
): Promise<boolean> {
  const c = await currentCouple(weddingId)
  const text = cleanBody(body)
  if (!c || !isUuid(fileId) || !text) return false
  const r = await coupleAddFileComment(getDb(), c.principal, fileId, text)
  if (r.ok) refresh(weddingId)
  return r.ok
}

export async function deleteImageComment(weddingId: string, commentId: string): Promise<boolean> {
  const c = await currentCouple(weddingId)
  if (!c || !isUuid(commentId)) return false
  const r = await coupleDeleteFileComment(getDb(), c.principal, commentId)
  if (r.ok) refresh(weddingId)
  return r.ok
}

export async function startImage(
  weddingId: string,
  boardId: string,
  input: { name: string; mime: string; sizeBytes: number; visibility: 'shared' | 'internal' },
): Promise<StartUpload> {
  const c = await currentCouple(weddingId)
  if (!c || !writable(c)) return { ok: false, error: 'notFound' }
  // `visibility` is ignored: a couple's image is always `shared` (couple_start_image).
  return startCoupleUpload(c, boardId, input)
}

export async function confirmImage(weddingId: string, fileId: string): Promise<Done> {
  const c = await currentCouple(weddingId)
  if (!c) return { ok: false, error: 'notFound' }
  const r = await confirmCoupleUpload(c, fileId)
  if (r.ok) refresh(weddingId)
  return r
}

export async function deleteImage(weddingId: string, fileId: string): Promise<boolean> {
  const c = await currentCouple(weddingId)
  if (!c || !isUuid(fileId)) return false
  const r = await coupleDeleteImage(getDb(), c.principal, fileId)
  if (r.ok) refresh(weddingId)
  return r.ok
}
