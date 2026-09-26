'use client'

import { Button, LinkButton } from '@guestnote/ui/button'
import { InlineError } from '@guestnote/ui/inline-error'
import { LiveRegion } from '@guestnote/ui/live-region'
import { useRef, useState } from 'react'
import { ImageIcon } from '../nav/icons.tsx'
import { LOGO_ACCEPT, type LogoError, type LogoResult } from './logo-upload.ts'

export type LogoFieldLabels = Readonly<{
  label: string
  upload: string
  replace: string
  remove: string
  uploading: string
  removing: string
  help: string
  /** Announced, not shown: the tile changing is what a sighted planner sees. */
  added: string
  removed: string
  errors: Readonly<Record<LogoError, string>>
}>

type Props = {
  readonly id: string
  readonly labels: LogoFieldLabels
  /** What to draw: a signed GET on the Studio page, an object URL in sign-up. `null` for none. */
  readonly url: string | null
  /** Hand one picked file to the caller, who uploads it or holds it. */
  readonly onPick: (file: File) => Promise<LogoResult>
  readonly onRemove: () => Promise<LogoResult>
  /** Frozen while the caller is using what was picked -- sign-up while it creates the studio. */
  readonly disabled?: boolean
}

/**
 * The logo block (spec 0005, "Logo"), shared by the Studio page and sign-up's Studio step.
 * It knows nothing about where a logo goes: `onPick` and `onRemove` do, and this only draws
 * the four states -- none, working, set, refused -- and says what happened.
 *
 * The button opens a visually hidden file input, the pattern `components/files/upload-zone.tsx`
 * uses: a styled button, and the real control still in the page for anything that drives it
 * without a pointer. One file, not `multiple`: a studio has one logo.
 *
 * The tile falls back to the empty placeholder when the image fails to load, remembered per
 * URL so a fresh signature gets its own attempt (the same rule as the sidebar's `OrgMark`).
 */
export function LogoField({ id, labels, url, onPick, onRemove, disabled = false }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'uploading' | 'removing' | null>(null)
  const [error, setError] = useState<LogoError | null>(null)
  const [announce, setAnnounce] = useState('')
  const [broken, setBroken] = useState<string | null>(null)
  const shown = url && broken !== url ? url : null

  async function run(kind: 'uploading' | 'removing', work: () => Promise<LogoResult>) {
    setBusy(kind)
    setError(null)
    setAnnounce('')
    const result = await work()
    setBusy(null)
    if (result.ok) setAnnounce(kind === 'uploading' ? labels.added : labels.removed)
    else setError(result.error)
  }

  const helpId = `${id}-help`
  const errorId = `${id}-error`

  return (
    // A fieldset named by its legend, because the label names three controls at once and none
    // of them is an input a `<label for>` could point at.
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1.5 block p-0 text-sm font-medium">{labels.label}</legend>
      <div className="flex items-center gap-3">
        {shown ? (
          // biome-ignore lint/performance/noImgElement: a presigned or object URL -- next/image would proxy a credential
          <img
            src={shown}
            alt=""
            data-testid="logo-tile"
            onError={() => setBroken(shown)}
            className="border-border size-12 shrink-0 rounded-[calc(var(--radius)-2px)] border bg-white object-contain"
          />
        ) : (
          <span
            aria-hidden="true"
            data-testid="logo-placeholder"
            className="border-input text-muted-foreground grid size-12 shrink-0 place-items-center rounded-[calc(var(--radius)-2px)] border border-dashed"
          >
            <ImageIcon className="size-5" />
          </span>
        )}

        {/* The button in its own box: `Button` is `w-full`, and `cx` does not merge classes, so
            a `w-auto` beside it would lose on source order. Sized by its label instead. */}
        <div className="flex items-center gap-4">
          <div>
            <Button
              variant="secondary"
              className="px-4"
              aria-describedby={error ? `${helpId} ${errorId}` : helpId}
              busy={busy !== null}
              disabled={disabled}
              busyLabel={busy === 'removing' ? labels.removing : labels.uploading}
              onClick={() => input.current?.click()}
            >
              {shown ? labels.replace : labels.upload}
            </Button>
          </div>
          {shown && busy === null && !disabled && (
            <LinkButton onClick={() => void run('removing', onRemove)}>{labels.remove}</LinkButton>
          )}
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept={LOGO_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        data-testid="logo-input"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Cleared so choosing the same file again, after a refusal, fires `change`.
          e.target.value = ''
          if (file) void run('uploading', () => onPick(file))
        }}
      />

      <p id={helpId} className="text-muted-foreground mt-2 text-xs leading-relaxed">
        {labels.help}
      </p>
      {error && <InlineError id={errorId}>{labels.errors[error]}</InlineError>}
      <LiveRegion message={announce} />
    </fieldset>
  )
}
