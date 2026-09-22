'use client'

import type { RunSheetItem, RunSheetVendor } from '@guestnote/db'
import { Button } from '@guestnote/ui/button'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'
import { Sheet } from '@guestnote/ui/sheet'
import { useTranslations } from 'next-intl'
import { type FormEvent, useRef, useState, useTransition } from 'react'
import {
  removeRunSheetItem,
  saveRunSheetItem,
  shiftRunSheetItem,
} from '../../app/pro/(app)/weddings/[id]/run-sheet/actions.ts'
import { clockToMinutes, minutesToClock, type RunSheetError } from '../../lib/run-sheet.ts'
import { Hint, SelectField } from '../money/form-bits.tsx'
import { MoveButtons } from './move-buttons.tsx'

/**
 * The side sheet that adds or edits one run sheet item.
 *
 * Built for typing a whole day in without the mouse: a new item opens with the start time set to
 * where the last one ends and a length of 15, and "Save and next" keeps the sheet open on the
 * following blank item. A spreadsheet is the bar (CLAUDE.md), and a sheet that closes after
 * every row loses to one where the next row is already under the cursor.
 *
 * A refused save keeps the draft and names the field. `RunSheetError` is a key, and the words
 * are looked up here in the planner's language, so the action never needs to know it.
 */
export function ItemSheet({
  weddingId,
  eventId,
  item,
  defaultStart,
  vendors,
  canMoveUp,
  canMoveDown,
  onClose,
}: {
  weddingId: string
  eventId: string
  /** `null` adds an item. */
  item: RunSheetItem | null
  defaultStart: string
  vendors: readonly RunSheetVendor[]
  canMoveUp: boolean
  canMoveDown: boolean
  onClose: () => void
}) {
  const t = useTranslations('app.s9.sheet')
  const te = useTranslations('app.s9.errors')
  const [startsAt, setStartsAt] = useState(item?.startsAt ?? defaultStart)
  const [duration, setDuration] = useState(item ? String(item.durationMin) : '15')
  const [what, setWhat] = useState(item?.title ?? '')
  const [place, setPlace] = useState(item?.place ?? '')
  const [vendorId, setVendorId] = useState(item?.weddingVendorId ?? '')
  const [error, setError] = useState<RunSheetError | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()
  const whatRef = useRef<HTMLInputElement>(null)

  // A vendor taken off the wedding still names rows. It stays selectable so an unrelated edit
  // does not silently blank the field; the repo skips the parent read for an unchanged vendor.
  const removed =
    item?.weddingVendorId && item.vendorName && !vendors.some((v) => v.id === item.weddingVendorId)
      ? { id: item.weddingVendorId, name: item.vendorName }
      : null

  const save = (next: boolean) => {
    setError(null)
    start(async () => {
      const result = await saveRunSheetItem(weddingId, item?.id ?? null, {
        eventId,
        startsAt,
        durationMin: duration,
        title: what,
        place,
        weddingVendorId: vendorId,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (!next) {
        onClose()
        return
      }
      // The next item starts where this one ended. A clock that wraps past midnight is fine: the
      // repo reads it as after midnight only once the list says so.
      const from = clockToMinutes(startsAt)
      setStartsAt(from === null ? startsAt : minutesToClock(from + Number(duration)))
      setWhat('')
      setPlace('')
      setVendorId('')
      whatRef.current?.focus()
    })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    save(false)
  }

  const remove = () => {
    if (!item) return
    setError(null)
    start(async () => {
      const result = await removeRunSheetItem(weddingId, item.id)
      if (result.ok) onClose()
      else setError(result.error)
    })
  }

  const move = (direction: 'up' | 'down') => {
    if (!item) return
    setError(null)
    start(async () => {
      const result = await shiftRunSheetItem(weddingId, item.id, direction)
      if (!result.ok) setError(result.error)
    })
  }

  const fieldError = (key: RunSheetError) =>
    error === key ? <InlineError id={`item-${key}-error`}>{te(key)}</InlineError> : null

  return (
    <Sheet
      open
      onClose={onClose}
      title={item ? t('titleEdit') : t('titleNew')}
      closeLabel={t('close')}
      footer={
        confirming ? (
          <div className="space-y-3">
            <p className="text-sm">{t('deleteAsk')}</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
                {t('cancel')}
              </Button>
              <Button onClick={remove} busy={pending} busyLabel={t('deleting')}>
                {t('deleteConfirm')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {item && (
              <div className="min-w-32 flex-1">
                <Button variant="secondary" onClick={() => setConfirming(true)} disabled={pending}>
                  {t('delete')}
                </Button>
              </div>
            )}
            {!item && (
              <div className="min-w-32 flex-1">
                <Button
                  variant="secondary"
                  onClick={() => save(true)}
                  disabled={pending}
                  data-testid="save-next"
                >
                  {t('saveNext')}
                </Button>
              </div>
            )}
            <div className="min-w-32 flex-1">
              <Button type="submit" form="item-form" busy={pending} busyLabel={t('saving')}>
                {t('save')}
              </Button>
            </div>
          </div>
        )
      }
    >
      <form id="item-form" onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Field
              id="item-time"
              type="time"
              label={t('startsAt')}
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              invalid={error === 'time'}
              errorId="item-time-error"
            />
            {fieldError('time')}
          </div>
          <div>
            <Field
              id="item-duration"
              label={t('duration')}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              invalid={error === 'duration'}
              errorId="item-duration-error"
            />
            {fieldError('duration')}
          </div>
        </div>
        <Hint id="item-duration-hint">{t('durationHint')}</Hint>
        <div>
          <Field
            id="item-what"
            ref={whatRef}
            label={t('what')}
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            maxLength={120}
            autoComplete="off"
            invalid={error === 'title'}
            errorId="item-title-error"
          />
          {fieldError('title')}
        </div>
        <div>
          <Field
            id="item-place"
            label={t('place')}
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            maxLength={120}
            autoComplete="off"
            invalid={error === 'place'}
            errorId="item-place-error"
          />
          <Hint id="item-place-hint">{t('placeHint')}</Hint>
          {fieldError('place')}
        </div>
        <div>
          <SelectField
            id="item-vendor"
            label={t('vendor')}
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            invalid={error === 'vendor'}
            errorId="item-vendor-error"
          >
            <option value="">{t('vendorNone')}</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
            {removed && (
              <option value={removed.id}>{t('vendorRemoved', { name: removed.name })}</option>
            )}
          </SelectField>
          {vendors.length === 0 && !removed && (
            <Hint id="item-vendor-hint">{t('vendorEmpty')}</Hint>
          )}
          {fieldError('vendor')}
        </div>
        {item && (
          // On a phone the rows carry no move buttons (they would eat the width the title needs),
          // so the order is changed here. From `md` up they are in the row and this hides.
          <div className="md:hidden">
            <p className="mb-1.5 text-sm font-medium">{t('order')}</p>
            <MoveButtons
              size="lg"
              upLabel={t('moveUp')}
              downLabel={t('moveDown')}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              disabled={pending}
              onMove={move}
            />
          </div>
        )}
        {(error === 'event' || error === 'notFound' || error === 'failed') && (
          <InlineError>{te(error)}</InlineError>
        )}
      </form>
    </Sheet>
  )
}
