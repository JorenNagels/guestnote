import { getFormatter } from 'next-intl/server'
import type { AuthCopy } from './copy.ts'
import type { StageContent } from './stage.tsx'

/**
 * Builds what the panel shows. Server-side, because the date has to be formatted in the
 * visitor's language and the day count has to be computed somewhere with a clock.
 *
 * ## Why the date rolls
 *
 * A hard-coded illustrative date is a countdown that eventually reads "-40 days", and a
 * login page quietly displaying a negative number is exactly the kind of thing nobody
 * notices for a year. So it picks the next 12 September that is still ahead. The mechanic
 * on show -- a wedding date, and everything measured backwards from it -- is the real one;
 * only the specimen is illustrative.
 *
 * `Els & Jan` is one of the two live weddings in the sibling `se-parti-rsvp` repo that
 * PRODUCT.md names as usable source material, and it is already the seed data on
 * app/pro/page.tsx.
 */
export async function getStageContent(copy: AuthCopy): Promise<StageContent> {
  const format = await getFormatter()

  const now = new Date()
  const thisYear = new Date(Date.UTC(now.getUTCFullYear(), 8, 12))
  const target =
    thisYear.getTime() - now.getTime() > 14 * 86_400_000
      ? thisYear
      : new Date(Date.UTC(now.getUTCFullYear() + 1, 8, 12))

  const days = Math.round((target.getTime() - now.getTime()) / 86_400_000)

  return {
    label: copy.stage.label,
    couple: copy.stage.couple,
    date: format.dateTime(target, { day: 'numeric', month: 'long', year: 'numeric' }),
    days,
    unit: copy.stage.unit,
    // Order is the order they are placed in, and `alert` is deliberately absent: red is
    // reserved for things genuinely broken, and a bounced address is not brand imagery.
    atoms: [
      { key: 'attending', label: copy.stage.attending },
      { key: 'awaiting', label: copy.stage.awaiting },
      { key: 'plusone', label: copy.stage.plusone },
      { key: 'declined', label: copy.stage.declined },
      { key: 'partial', label: copy.stage.partial },
    ],
  }
}
