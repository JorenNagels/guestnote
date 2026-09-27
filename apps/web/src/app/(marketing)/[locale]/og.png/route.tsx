import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'
import { MARK_FILL } from '../../../../components/marketing/mark-paths.ts'
import { DEFAULT_LOCALE, isLocale, LOCALES } from '../../../../lib/locales.ts'

/**
 * `/<locale>/og.png` -- the share card for every marketing page, one per locale (spec 0006, "SEO").
 *
 * A route handler and not the `opengraph-image` file convention, which it was first: Next
 * replaces `openGraph` wholesale at each metadata level and restores a file-based image only in
 * the directory that holds the file, so every `[slug]` page -- pricing, features, the legal
 * pages -- lost its image (read in Next 16.3.1's `resolve-metadata.js` by the review panel,
 * 2026-09-27). A fixed URL that `lib/marketing-metadata.ts` names explicitly cannot be dropped
 * that way. `og.png` is a static segment, so it wins over `[slug]` for that path. Generated at build
 * from the catalogue rather than a PNG, because `coming-soon/og.png` says "Binnenkort" and is in
 * Dutch only -- a card that announces a launch after the launch.
 *
 * The coming-soon ground and cream headline, and the mark in its frozen logo colours. Satori's
 * default sans, not the display face: loading Fraunces here would mean fetching a font file at
 * build, and a share card at thumbnail size does not carry a serif's detail.
 */
const size = { width: 1200, height: 630 }

/** Built once per locale at deploy, like the pages. */
export const dynamic = 'force-static'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE
  const t = await getTranslations({ locale, namespace: 'marketing' })
  const headline = t('home.headline')

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: '#06211F',
        color: '#ECFAF9',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <svg width="58" height="63" viewBox="0 0 1242 1351" fill="none" aria-hidden="true">
          <path d={MARK_FILL.card.d} fill={MARK_FILL.card.fill} />
          <path d={MARK_FILL.flap.d} fill={MARK_FILL.flap.fill} />
          <path d={MARK_FILL.gold.d} fill={MARK_FILL.gold.fill} />
        </svg>
        <span style={{ fontSize: 34, letterSpacing: 6, color: '#94CFC9' }}>GUESTNOTE</span>
      </div>
      <div style={{ display: 'flex', fontSize: 60, lineHeight: 1.12, maxWidth: 1000 }}>
        {headline}
      </div>
      <div style={{ display: 'flex', fontSize: 28, color: '#D6B776' }}>guestnote.be</div>
    </div>,
    size,
  )
}
