import { getTranslations } from 'next-intl/server'
import { WeddingTabsNav } from './wedding-tabs-nav.tsx'

export {
  type WeddingTab,
  type WeddingTabLabels,
  WeddingTabsView,
} from './wedding-tabs-view.tsx'

/**
 * The words are the sidebar's (`app.shell.nav.*` and `app.nav.overview`), so the strip adds no
 * copy of its own to translate and cannot disagree with the sidebar about a name.
 */
export async function WeddingTabs({ weddingId }: { weddingId: string }) {
  const [t, nav, s1] = await Promise.all([
    getTranslations('app.shell.nav'),
    getTranslations('app.nav'),
    getTranslations('app.weddingPages.tabs'),
  ])
  return (
    <WeddingTabsNav
      weddingId={weddingId}
      navLabel={s1('label')}
      labels={{
        overview: nav('overview'),
        tasks: t('checklist'),
        budget: t('budget'),
        payments: t('payments'),
        vendors: t('vendors'),
        runSheet: t('runSheet'),
        files: t('files'),
        moodboard: t('moodboard'),
        settings: t('settings'),
      }}
    />
  )
}
