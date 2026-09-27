import type { PageId } from '../../../lib/marketing-pages.ts'
import { ACCESSIBILITY } from './accessibility.tsx'
import { COOKIES } from './cookies.tsx'
import { DPA } from './dpa.tsx'
import { PRIVACY } from './privacy.tsx'
import { SUBPROCESSORS } from './subprocessors.tsx'
import { TERMS } from './terms.tsx'
import type { LegalText } from './types.ts'

/**
 * The long-form legal pages by page id. `legal` (the legal notice) is not here: it is built from
 * the operator config, not written as prose -- see `pages/legal-notice.tsx`.
 */
export const LEGAL_TEXTS = {
  terms: TERMS,
  privacy: PRIVACY,
  dpa: DPA,
  subprocessors: SUBPROCESSORS,
  cookies: COOKIES,
  accessibility: ACCESSIBILITY,
} as const satisfies Partial<Record<PageId, LegalText>>

export type LegalTextId = keyof typeof LEGAL_TEXTS

export function isLegalTextId(id: PageId): id is LegalTextId {
  return id in LEGAL_TEXTS
}
