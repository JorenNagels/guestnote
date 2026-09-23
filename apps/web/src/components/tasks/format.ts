import type { useFormatter, useTranslations } from 'next-intl'
import type { LabelKey } from './labels.ts'

type Format = ReturnType<typeof useFormatter>
type Translate = ReturnType<typeof useTranslations>

/**
 * A civil date (`YYYY-MM-DD`) as text. `timeZone: 'UTC'` is the point, not a detail: the date is
 * read as UTC midnight, and the i18n config's `Europe/Brussels` would render it correctly while
 * a zone west of Greenwich, or a bundle that ignored the config, would show the day before
 * (`weddings/[id]/page.tsx` has the measurement).
 */
export function formatDate(format: Format, iso: string): string {
  return format.dateTime(new Date(`${iso}T00:00:00Z`), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** An instant as `12 Sep, 14:30`, in UTC like everything else here. The caller adds "UTC". */
export function formatInstant(format: Format, at: Date): string {
  return format.dateTime(at, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  })
}

export function labelText(t: Translate, label: LabelKey | null): string | null {
  return label ? t(label.key, label.values) : null
}
