'use client'

import { Button } from '@guestnote/ui/button'
import { Card } from '@guestnote/ui/card'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { type FormEvent, startTransition, useActionState, useEffect, useRef, useState } from 'react'
import type { LogoDone, StartLogo } from '../../lib/studio-logo.ts'
import { LogoField, type LogoFieldLabels } from '../studio/logo-field.tsx'
import { checkLogoFile, uploadLogo } from '../studio/logo-upload.ts'
import { StudioMark } from '../studio/studio-mark.tsx'
import { MAX_OWNER_NAME, STUDIO_NAME_MAX, type StudioFormState } from './state.ts'

export type StudioLabels = Readonly<{
  title: string
  intro: string
  nameLabel: string
  namePlaceholder: string
  ownerLabel: string
  ownerPlaceholder: string
  preview: string
  previewFallback: string
  create: string
  creating: string
  /** The button once the studio exists and only the logo failed. */
  continue: string
  errors: Readonly<Record<'required' | 'tooLong' | 'failed' | 'forbidden', string>>
  logo: LogoFieldLabels & { readonly afterCreate: string }
}>

type Props = {
  readonly labels: StudioLabels
  /** The name already on the account, if any; the field is prefilled and editable. */
  readonly ownerName: string
  readonly action: (prev: StudioFormState, fd: FormData) => Promise<StudioFormState>
  /** Upload into the studio this user owns -- callable only once it exists. */
  readonly logoActions: {
    start(input: { mime: string; sizeBytes: number }): Promise<StartLogo>
    confirm(fileId: string): Promise<LogoDone>
  }
}

type Held = { readonly file: File; readonly url: string }

/**
 * Sign-up step "Studio": the studio's name and the owner's, and a preview of how the name
 * reads to couples and vendors (spec 0005, Sign-up step 4).
 *
 * Controlled fields, and the form is posted from `onSubmit` rather than through `action=`: React
 * 19 resets a form after its action runs, and the preview row and the disabled state both read
 * these values while the request is in flight. "Create studio" stays disabled until both names
 * are non-blank; the server checks the same thing again.
 */
export function StudioStep({ labels, ownerName: initialOwner, action, logoActions }: Props) {
  const [state, dispatch, pending] = useActionState(action, {})
  const [name, setName] = useState('')
  const [ownerName, setOwnerName] = useState(initialOwner)
  const [logo, setLogo] = useState<Held | null>(null)
  const [uploading, setUploading] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const posted = useRef<FormData | null>(null)
  const handled = useRef(false)
  const ready = name.trim() !== '' && ownerName.trim() !== ''

  // The held logo's object URL dies with it: on replace, on remove, and on leaving the step.
  useEffect(() => (logo ? () => URL.revokeObjectURL(logo.url) : undefined), [logo])

  // The studio exists and a logo was held for it: upload it now, then post the form again,
  // which `createStudioAction` answers as `alreadyOwner` -- set the org cookie, go to the
  // wedding step. Once per mount; a failed upload stays on this step and says so, and the
  // button becomes "Continue", which is that same second post.
  useEffect(() => {
    if (!state.created || handled.current) return
    handled.current = true
    const file = logo?.file
    const fd = posted.current
    if (!fd) return
    if (!file) {
      startTransition(() => dispatch(fd))
      return
    }
    setUploading(true)
    void uploadLogo(file, logoActions).then((outcome) => {
      if (outcome.ok) {
        // Cleared in the same transition as the post, so `pending` carries the busy state from
        // here: a refused second post (an expired session) must leave the button usable.
        startTransition(() => {
          setUploading(false)
          dispatch(fd)
        })
      } else {
        setUploading(false)
        setLogoFailed(true)
      }
    })
  }, [state.created, logo, logoActions, dispatch])

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ready || pending || uploading) return
    const fd = new FormData(e.currentTarget)
    fd.set('logo', logo && !logoFailed ? '1' : '')
    posted.current = fd
    startTransition(() => dispatch(fd))
  }

  const nameError = state.errors?.name
  const ownerError = state.errors?.ownerName
  const shown = name.trim() || labels.previewFallback

  return (
    <>
      <h1 className="mb-1.5 text-2xl leading-tight font-semibold tracking-tight">{labels.title}</h1>
      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{labels.intro}</p>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div>
          <Field
            id="signup-studio-name"
            name="name"
            label={labels.nameLabel}
            placeholder={labels.namePlaceholder}
            autoComplete="organization"
            maxLength={STUDIO_NAME_MAX}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            invalid={Boolean(nameError)}
            errorId="signup-studio-name-error"
          />
          {nameError && (
            <InlineError id="signup-studio-name-error">{labels.errors[nameError]}</InlineError>
          )}
        </div>

        <div>
          <Field
            id="signup-owner-name"
            name="ownerName"
            label={labels.ownerLabel}
            placeholder={labels.ownerPlaceholder}
            autoComplete="name"
            maxLength={MAX_OWNER_NAME}
            value={ownerName}
            onChange={(e) => setOwnerName(e.currentTarget.value)}
            invalid={Boolean(ownerError)}
            errorId="signup-owner-name-error"
          />
          {ownerError && (
            <InlineError id="signup-owner-name-error">{labels.errors[ownerError]}</InlineError>
          )}
        </div>

        {/* Held in the browser, not uploaded: there is no studio to put it in until "Create
            studio" succeeds, and the upload follows then (spec 0005, as built). So the checks
            the server would make are made here first, to refuse a 5 MB photo beside the field
            rather than after the studio exists. Once created, the field is done. */}
        {logoFailed ? null : (
          <LogoField
            id="signup-logo"
            labels={labels.logo}
            url={logo?.url ?? null}
            // Whether a logo goes up is decided at submit, so a pick after that would be dropped.
            disabled={pending || uploading || state.created === true}
            onPick={async (file) => {
              const checked = checkLogoFile(file)
              if (checked.ok) setLogo({ file, url: URL.createObjectURL(file) })
              return checked
            }}
            onRemove={async () => {
              setLogo(null)
              return { ok: true }
            }}
          />
        )}

        <div>
          <span className="mb-1.5 block text-xs text-muted-foreground">{labels.preview}</span>
          <Card className="flex items-center gap-3">
            <StudioMark name={shown} logoUrl={logoFailed ? null : logo?.url} />
            <span className="min-w-0 truncate text-sm font-semibold">{shown}</span>
          </Card>
        </div>

        {state.form && <InlineError>{labels.errors[state.form]}</InlineError>}
        {logoFailed && <InlineError>{labels.logo.afterCreate}</InlineError>}

        <Button
          type="submit"
          disabled={!ready}
          busy={pending || uploading}
          busyLabel={labels.creating}
        >
          {logoFailed ? labels.continue : labels.create}
        </Button>
      </form>
    </>
  )
}
