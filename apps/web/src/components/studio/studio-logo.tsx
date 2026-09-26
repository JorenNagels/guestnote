'use client'

import type { LogoDone, StartLogo } from '../../lib/studio-logo.ts'
import { LogoField, type LogoFieldLabels } from './logo-field.tsx'
import { logoErrorOf, uploadLogo } from './logo-upload.ts'

/**
 * The Studio page's logo block: `LogoField` wired to the page's Server Functions. The tile's
 * new URL arrives with the re-rendered layout -- `confirmStudioLogo` revalidates it -- so nothing
 * here holds the uploaded file or builds a URL for it.
 */
export function StudioLogo({
  url,
  labels,
  actions,
}: {
  url: string | null
  labels: LogoFieldLabels
  actions: {
    start(input: { mime: string; sizeBytes: number }): Promise<StartLogo>
    confirm(fileId: string): Promise<LogoDone>
    remove(): Promise<LogoDone>
  }
}) {
  return (
    <LogoField
      id="studio-logo"
      labels={labels}
      url={url}
      onPick={(file) => uploadLogo(file, { start: actions.start, confirm: actions.confirm })}
      onRemove={async () => {
        try {
          const done = await actions.remove()
          return done.ok ? { ok: true } : { ok: false, error: logoErrorOf(done.error) }
        } catch {
          return { ok: false, error: 'failed' }
        }
      }}
    />
  )
}
