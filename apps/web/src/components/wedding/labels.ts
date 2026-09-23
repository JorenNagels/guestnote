import type { FieldError } from '../../lib/wedding-parse.ts'

/**
 * The words the two client forms need, gathered on the server and handed down as props --
 * the pattern `components/auth` uses, because no `NextIntlClientProvider` wraps this surface.
 * Each page builds them once from `getTranslations('app.weddingPages')`.
 */
type T = (key: string) => string
type TRaw = T & { raw: (key: string) => unknown }

export type ErrorLabels = Readonly<Record<FieldError | 'forbidden' | 'failed', string>>

export type WeddingFormLabels = {
  readonly couple: string
  readonly couplePlaceholder: string
  readonly date: string
  readonly dateHint: string
  readonly venue: string
  readonly venuePlaceholder: string
  readonly guests: string
  readonly stage: string
  readonly notes: string
  readonly notesHint: string
  readonly notesPlaceholder: string
  readonly sectionWedding: string
  readonly sectionColour: string
  readonly colourHint: string
  readonly colourGroup: string
  readonly colourCustom: string
  readonly colourNone: string
  /** Keyed by `#RRGGBB` upper case, one per preset. */
  readonly colours: Readonly<Record<string, string>>
  readonly statuses: Readonly<Record<'draft' | 'live' | 'archived', string>>
  readonly submit: string
  readonly saving: string
  readonly saved: string
  readonly cancel: string
  readonly errors: ErrorLabels
}

export type EventsLabels = {
  readonly title: string
  readonly hint: string
  readonly label: string
  readonly labelPlaceholder: string
  readonly date: string
  readonly time: string
  readonly venue: string
  readonly save: string
  readonly add: string
  readonly remove: string
  readonly saving: string
  readonly saved: string
  readonly empty: string
  readonly errors: ErrorLabels
}

/**
 * Read from the catalogue as a map, not built from `COLOR_PRESETS`: that constant lives in a
 * `'use client'` module, which a server file can import only as a reference and not as an
 * array. The cost is that a preset with no name here falls back to its hex in the form.
 */
function colourNames(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null) return {}
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string'))
}

export function errorLabels(t: T): ErrorLabels {
  return {
    required: t('errors.required'),
    tooLong: t('errors.tooLong'),
    invalidDate: t('errors.invalidDate'),
    invalidNumber: t('errors.invalidNumber'),
    invalidTime: t('errors.invalidTime'),
    invalidColor: t('errors.invalidColor'),
    invalidStatus: t('errors.invalidStatus'),
    forbidden: t('errors.forbidden'),
    failed: t('errors.failed'),
  }
}

/**
 * `submit` is the only word that differs between create and edit, so the caller passes it:
 * "Bruiloft aanmaken" and "Opslaan" are both keys, and choosing between them is the page's job.
 */
export function weddingFormLabels(t: TRaw, status: T, submit: string): WeddingFormLabels {
  return {
    couple: t('form.couple'),
    couplePlaceholder: t('form.couplePlaceholder'),
    date: t('form.date'),
    dateHint: t('form.dateHint'),
    venue: t('form.venue'),
    venuePlaceholder: t('form.venuePlaceholder'),
    guests: t('form.guests'),
    stage: t('form.stage'),
    notes: t('form.notes'),
    notesHint: t('form.notesHint'),
    notesPlaceholder: t('form.notesPlaceholder'),
    sectionWedding: t('form.sectionWedding'),
    sectionColour: t('form.sectionColour'),
    colourHint: t('form.colourHint'),
    colourGroup: t('form.colourGroup'),
    colourCustom: t('form.colourCustom'),
    colourNone: t('form.colourNone'),
    colours: colourNames(t.raw('form.colours')),
    statuses: { draft: status('draft'), live: status('live'), archived: status('archived') },
    submit,
    saving: t('form.saving'),
    saved: t('form.saved'),
    cancel: t('form.cancel'),
    errors: errorLabels(t),
  }
}

export function eventsLabels(t: T): EventsLabels {
  return {
    title: t('events.title'),
    hint: t('events.hint'),
    label: t('events.label'),
    labelPlaceholder: t('events.labelPlaceholder'),
    date: t('events.date'),
    time: t('events.time'),
    venue: t('events.venue'),
    save: t('events.save'),
    add: t('events.add'),
    remove: t('events.remove'),
    saving: t('form.saving'),
    saved: t('events.saved'),
    empty: t('events.empty'),
    errors: errorLabels(t),
  }
}
