import type { TaskVisibility } from '@guestnote/db'
import { Pill } from '@guestnote/ui/pill'
import { useTranslations } from 'next-intl'

/**
 * Internal or shared, in words AND a dot. Never colour alone: these lists get printed in black
 * and white (prototype note, spec 0003), and a couple's view of the same list must not have to
 * be told the meaning of amber.
 */
export function VisibilityTag({ visibility }: { visibility: TaskVisibility }) {
  const t = useTranslations('app.tasks.visibility')
  return <Pill tone={visibility === 'internal' ? 'warning' : 'info'}>{t(visibility)}</Pill>
}
