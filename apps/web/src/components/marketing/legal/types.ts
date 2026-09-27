import type { ReactNode } from 'react'
import type { Locale } from '../../../lib/locales.ts'

/**
 * One legal page in one language: an optional intro and numbered sections, each with an id
 * for the table of contents. Written as TSX rather than markdown -- no parser dependency, the
 * links are real `<a>`s, and a missing locale is a type error rather than a blank page.
 */
export type LegalSection = Readonly<{ id: string; title: string; body: ReactNode }>

export type LegalDoc = Readonly<{
  intro?: ReactNode
  sections: readonly LegalSection[]
}>

export type LegalText = Readonly<Record<Locale, LegalDoc>>
