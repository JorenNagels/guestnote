import { getTranslations } from 'next-intl/server'
import { WeddingTabsNav } from './wedding-tabs-nav.tsx'

export {
  type WeddingTab,
  type WeddingTabLabels,
  WeddingTabsView,
} from './wedding-tabs-view.tsx'

/**
 * The words are the shell's (`app.shell.nav.*` and `app.nav.overview`), so the strip shares its
 * names with the palette and the rest of the app rather than keeping its own. `money` is the
 * one word only the strip uses (spec 0009 A1); it lives beside the others for the same reason.
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
        money: t('money'),
        vendors: t('vendors'),
        runSheet: t('runSheet'),
        files: t('files'),
        moodboard: t('moodboard'),
        settings: t('settings'),
      }}
    />
  )
}
