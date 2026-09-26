'use client'

import { Button } from '@guestnote/ui/button'
import { Card } from '@guestnote/ui/card'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { type FormEvent, startTransition, useActionState, useState } from 'react'
import { Monogram } from '../nav/monogram.tsx'
import { MAX_OWNER_NAME, STUDIO_NAME_MAX, type StudioFormState } from './state.ts'

export type StudioLabels = Readonly<{
  title: string
  intro: string
  nameLabel: string
  namePlaceholder: string
  ownerLabel: string
  ownerPlaceholder: string
  logoLabel: string
  logoLater: string
  preview: string
  previewFallback: string
  create: string
  creating: string
  errors: Readonly<Record<'required' | 'tooLong' | 'failed' | 'forbidden', string>>
}>

type Props = {
  readonly labels: StudioLabels
  /** The name already on the account, if any; the field is prefilled and editable. */
  readonly ownerName: string
  readonly action: (prev: StudioFormState, fd: FormData) => Promise<StudioFormState>
}

/**
 * Sign-up step "Studio": the studio's name and the owner's, and a preview of how the name
 * reads to couples and vendors (spec 0005, Sign-up step 4).
 *
 * Controlled fields, and the form is posted from `onSubmit` rather than through `action=`: React
 * 19 resets a form after its action runs, and the preview row and the disabled state both read
 * these values while the request is in flight. "Create studio" stays disabled until both names
 * are non-blank; the server checks the same thing again.
 */
export function StudioStep({ labels, ownerName: initialOwner, action }: Props) {
  const [state, dispatch, pending] = useActionState(action, {})
  const [name, setName] = useState('')
  const [ownerName, setOwnerName] = useState(initialOwner)
  const ready = name.trim() !== '' && ownerName.trim() !== ''

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!ready || pending) return
    const fd = new FormData(e.currentTarget)
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

        {/* The logo slot. Spec 0005 slice 4 puts `components/studio/logo-field.tsx` here --
            upload, preview, remove -- shared with the Studio page. Until then it says where
            the logo will be added, and uploads nothing. */}
        <div>
          <span className="mb-1.5 block text-sm font-medium">{labels.logoLabel}</span>
          <div className="flex items-center gap-3 rounded-[var(--radius)] border border-dashed border-input p-3">
            <Monogram name={shown} className="size-9" />
            <span className="text-xs leading-relaxed text-muted-foreground">
              {labels.logoLater}
            </span>
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs text-muted-foreground">{labels.preview}</span>
          <Card className="flex items-center gap-3">
            <Monogram name={shown} />
            <span className="min-w-0 truncate text-sm font-semibold">{shown}</span>
          </Card>
        </div>

        {state.form && <InlineError>{labels.errors[state.form]}</InlineError>}

        <Button type="submit" disabled={!ready} busy={pending} busyLabel={labels.creating}>
          {labels.create}
        </Button>
      </form>
    </>
  )
}
