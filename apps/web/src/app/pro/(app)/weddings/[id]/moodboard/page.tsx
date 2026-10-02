import { getCoupleAccess, getWeddingVendors, imageCoupleInfo } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { moodboardLabels } from '../../../../../../components/files/labels.ts'
import { MoodboardScreen } from '../../../../../../components/files/moodboard-screen.tsx'
import { weddingBoards } from '../../../../../../lib/moodboards.ts'
import { listWeddingImages } from '../../../../../../lib/wedding-files.ts'
import { currentWeddingScope } from '../../../../../../lib/wedding-scope.ts'
import {
  addImageCommentAction,
  confirmImageUpload,
  createMoodboard,
  deleteMoodboard,
  imageCommentsAction,
  moveMoodboardImage,
  removeImage,
  renameImage,
  renameMoodboard,
  restoreImage,
  shareMoodboard,
  shareMoodboardWithCouple,
  startImageUpload,
} from './actions.ts'

/**
 * A wedding's moodboards (spec 0003 S5, spec 0007; behaviour in `components/files/SPEC.md`).
 *
 * `?bord=<id>` picks the board, so a reload and a link a colleague pastes land on it; missing or
 * unknown, the default board. Every image URL is signed here, at render, and lives five minutes.
 * `null` from any read is a 404, as on every wedding screen.
 */
export default async function MoodboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ bord?: string | string[] }>
}) {
  const [{ id }, { bord }, t, ct, pt] = await Promise.all([
    params,
    searchParams,
    getTranslations('app.files'),
    getTranslations('app.couple.planner'),
    getTranslations('app.couple.portal'),
  ])

  const [boards, scope] = await Promise.all([weddingBoards(id), currentWeddingScope(id)])
  if (!boards || !scope) notFound()
  const board = boards.find((b) => b.id === bord) ?? boards.find((b) => b.isDefault) ?? boards[0]
  // Every wedding has a default board (createWedding, migration 0012). None at all is a broken
  // invariant, and a 404 is a better answer than a board screen with nowhere to upload.
  if (!board) notFound()

  const [tiles, vendors] = await Promise.all([
    listWeddingImages(id, board.id),
    getWeddingVendors(scope),
  ])
  if (!tiles || !vendors) notFound()

  // Spec 0008: who added each image, the couple's unread dot, and the comment counts.
  const [info, couple] = await Promise.all([
    imageCoupleInfo(
      scope,
      tiles.map((r) => r.id),
    ),
    getCoupleAccess(scope),
  ])
  const partners = new Set(couple?.partners.map((p) => p.userId) ?? [])

  return (
    <MoodboardScreen
      labels={moodboardLabels((key) => t.raw(key))}
      items={tiles.map((r) => {
        const i = info[r.id]
        return {
          id: r.id,
          name: r.name,
          url: r.url,
          couple: i && {
            unread: i.coupleUnread,
            addedBy: i.uploadedBy && partners.has(i.uploadedBy) ? i.uploaderName : null,
            commentCount: i.commentCount,
          },
        }
      })}
      comments={{
        list: imageCommentsAction.bind(null, id),
        add: addImageCommentAction.bind(null, id),
        copy: {
          empty: pt('noComments'),
          placeholder: pt('commentPlaceholder'),
          send: pt('commentSend'),
          sending: ct('sending'),
          remove: pt('commentDelete'),
          failed: pt('commentFailed'),
          tooLong: pt('commentTooLong'),
          couple: ct('chip'),
          addedBy: String(ct.raw('addedBy')),
          unread: ct('unread'),
          comments: String(ct.raw('comments')),
        },
      }}
      boards={{
        list: boards,
        current: board.id,
        weddingId: id,
        vendors: vendors.linked.map((v) => ({
          id: v.id,
          name: v.name,
          category: v.category,
          // A member cannot read `vendor_links` (owner/admin, 0006), so for them "no link" would
          // be a guess, and the marker is left out rather than shown wrong.
          hasLink: vendors.canCreate ? v.activeLink !== null : null,
        })),
      }}
      actions={{
        start: startImageUpload.bind(null, id, board.id),
        confirm: confirmImageUpload.bind(null, id),
        remove: removeImage.bind(null, id),
        restore: restoreImage.bind(null, id),
        rename: renameImage.bind(null, id),
        move: moveMoodboardImage.bind(null, id),
      }}
      boardActions={{
        create: createMoodboard.bind(null, id),
        rename: renameMoodboard.bind(null, id),
        remove: deleteMoodboard.bind(null, id),
        share: shareMoodboard.bind(null, id),
        shareCouple: shareMoodboardWithCouple.bind(null, id),
      }}
    />
  )
}
