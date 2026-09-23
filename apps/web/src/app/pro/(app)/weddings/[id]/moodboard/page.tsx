import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { moodboardLabels } from '../../../../../../components/files/labels.ts'
import { MoodboardScreen } from '../../../../../../components/files/moodboard-screen.tsx'
import { listWeddingImages } from '../../../../../../lib/wedding-files.ts'
import { confirmImageUpload, removeImage, renameImage, startImageUpload } from './actions.ts'

/**
 * A wedding's moodboard (spec 0003, S5; behaviour in `components/files/SPEC.md`).
 *
 * Every image URL is signed here, at render, and lives five minutes. `null` is a 404, as on
 * every wedding screen.
 */
export default async function MoodboardPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, t] = await Promise.all([params, getTranslations('app.files')])

  const tiles = await listWeddingImages(id)
  if (!tiles) notFound()

  return (
    <MoodboardScreen
      labels={moodboardLabels((key) => t.raw(key))}
      items={tiles.map((r) => ({ id: r.id, name: r.name, url: r.url }))}
      actions={{
        start: startImageUpload.bind(null, id),
        confirm: confirmImageUpload.bind(null, id),
        remove: removeImage.bind(null, id),
        rename: renameImage.bind(null, id),
      }}
    />
  )
}
