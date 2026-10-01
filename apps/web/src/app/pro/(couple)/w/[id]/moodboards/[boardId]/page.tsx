import { coupleMoodboards } from '@guestnote/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { commentCounts, threadCopy } from '../../../../../../../components/couple/labels.ts'
import { PortalBoard } from '../../../../../../../components/couple/portal/portal-board.tsx'
import { moodboardLabels } from '../../../../../../../components/files/labels.ts'
import { coupleModule, portalBoardImages } from '../../../../../../../lib/couple.ts'
import { getDb } from '../../../../../../../lib/db.ts'
import { app } from '../../../../../../../lib/routes.ts'
import {
  addImageComment,
  confirmImage,
  deleteImage,
  deleteImageComment,
  imageThread,
  startImage,
} from '../../actions.ts'

/**
 * One shared board (spec 0008). A board that is not shared with the couple -- or not on this
 * wedding, or not a board -- is a 404: `couple_moodboards` is the list of what exists for them.
 * Images are signed here for five minutes, as on the planner's board.
 */
export default async function CoupleBoardPage({
  params,
}: {
  params: Promise<{ id: string; boardId: string }>
}) {
  const [{ id, boardId }, t, ct, files] = await Promise.all([
    params,
    getTranslations('app.couple.portal'),
    getTranslations('app.couple.planner'),
    getTranslations('app.files'),
  ])
  const c = await coupleModule(id, 'moodboards')
  if (!c) notFound()
  const board = (await coupleMoodboards(getDb(), c.principal)).find((b) => b.id === boardId)
  if (!board) notFound()
  const tiles = await portalBoardImages(c, boardId)
  const base = moodboardLabels((key) => files.raw(key))

  return (
    <div>
      <Link
        href={app.coupleMoodboards(id)}
        className="text-primary text-sm underline underline-offset-[3px]"
      >
        {t('back')}
      </Link>
      <h2 className="mt-2 mb-4 text-lg font-semibold tracking-tight">{board.name}</h2>
      <PortalBoard
        tiles={tiles.map((tile) => ({
          ...tile,
          addedBy: tile.addedBy ? ct('addedBy', { name: tile.addedBy }) : null,
        }))}
        readOnly={c.home.status !== 'live'}
        copy={{
          empty: t('boardEmpty'),
          remove: t('deleteImage'),
          imageUnavailable: base.imageUnavailable,
          upload: base.upload,
          comments: commentCounts(t),
          thread: threadCopy(t, ct),
        }}
        actions={{
          start: startImage.bind(null, id, boardId),
          confirm: confirmImage.bind(null, id),
          remove: deleteImage.bind(null, id),
          thread: imageThread.bind(null, id),
          comment: addImageComment.bind(null, id),
          removeComment: deleteImageComment.bind(null, id),
        }}
      />
    </div>
  )
}
