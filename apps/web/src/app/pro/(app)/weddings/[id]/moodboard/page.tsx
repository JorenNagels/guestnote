import { getWeddingVendors } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { moodboardLabels } from '../../../../../../components/files/labels.ts'
import { MoodboardScreen } from '../../../../../../components/files/moodboard-screen.tsx'
import { weddingBoards } from '../../../../../../lib/moodboards.ts'
import { listWeddingImages } from '../../../../../../lib/wedding-files.ts'
import { currentWeddingScope } from '../../../../../../lib/wedding-scope.ts'
import {
  confirmImageUpload,
  createMoodboard,
  deleteMoodboard,
  moveMoodboardImage,
  removeImage,
  renameImage,
  renameMoodboard,
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
  const [{ id }, { bord }, t] = await Promise.all([
    params,
    searchParams,
    getTranslations('app.files'),
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

  return (
    <MoodboardScreen
      labels={moodboardLabels((key) => t.raw(key))}
      items={tiles.map((r) => ({ id: r.id, name: r.name, url: r.url }))}
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
