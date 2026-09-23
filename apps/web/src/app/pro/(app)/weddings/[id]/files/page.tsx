import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { FilesScreen } from '../../../../../../components/files/files-screen.tsx'
import { filesLabels } from '../../../../../../components/files/labels.ts'
import { listWeddingFiles } from '../../../../../../lib/wedding-files.ts'
import {
  confirmFileUpload,
  downloadFile,
  removeFile,
  renameFile,
  setFileVisibility,
  startFileUpload,
} from './actions.ts'

/**
 * A wedding's documents (spec 0003, S5; behaviour in `components/files/SPEC.md`).
 *
 * `null` from the read is a 404 and never a 403, the rule `weddings/[id]/page.tsx` argues: no
 * such wedding, another organisation's wedding and a `member` who is not assigned to it all look
 * the same from here. Nothing is signed at render; a download mints its own URL on click.
 */
export default async function FilesPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, t, locale] = await Promise.all([params, getTranslations('app.files'), getLocale()])

  const rows = await listWeddingFiles('file', id)
  if (!rows) notFound()

  return (
    <FilesScreen
      locale={locale}
      labels={filesLabels((key) => t.raw(key))}
      items={rows.map((r) => ({
        id: r.id,
        name: r.name,
        mime: r.mime,
        sizeBytes: r.sizeBytes,
        visibility: r.visibility,
        uploadedByName: r.uploadedByName,
        createdAt: r.createdAt.toISOString(),
      }))}
      actions={{
        start: startFileUpload.bind(null, id),
        confirm: confirmFileUpload.bind(null, id),
        remove: removeFile.bind(null, id),
        rename: renameFile.bind(null, id),
        setVisibility: setFileVisibility.bind(null, id),
        download: downloadFile.bind(null, id),
      }}
    />
  )
}
