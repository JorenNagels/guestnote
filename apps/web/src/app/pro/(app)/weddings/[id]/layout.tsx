import { getWeddingDetail, WeddingScope } from '@guestnote/db'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { WeddingHeader } from '../../../../../components/wedding/wedding-header.tsx'
import { WeddingTabs } from '../../../../../components/wedding/wedding-tabs.tsx'
import { getDb } from '../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../lib/principal.ts'
import { isUuid } from '../../../../../lib/uuid.ts'

/**
 * The wedding's header and tab strip, once, above every screen of that wedding.
 *
 * ## Why this is a layout
 *
 * Next keeps a layout mounted while you move between the pages under it and re-renders only the
 * page, so a tab switch now swaps the content below the header and nothing else. Until
 * 2026-09-24 each screen rendered its own header, which put the couple's name and the tabs inside
 * every screen's loading skeleton: a planner clicking Budget watched the title they were already
 * looking at blink into grey bars ("why is that reloading?"). The skeletons below this layout are
 * now content-only.
 *
 * ## Still not the gate
 *
 * `getWeddingDetail` is read here for the header, and its `null` is a 404 for the same reasons
 * the overview gives (a couple, an outside editor, another org, an unassigned member, all
 * indistinguishable). Every page below still resolves its own scope and 404s on its own: a layout
 * is not re-run on every navigation, so it cannot be the only check, and a Server Function never
 * passes through it at all (invariant 7's reasoning, one level down). Cost: the overview and
 * settings read the wedding twice on a full load, once here and once for their own fields.
 */
export default async function WeddingLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>
  children: ReactNode
}) {
  const [{ id }, memberships, orgId] = await Promise.all([
    params,
    currentMemberships(),
    currentOrgId(),
  ])
  if (!memberships || !orgId || !isUuid(id)) notFound()

  const wedding = await getWeddingDetail(WeddingScope.of(getDb(), memberships, orgId, id))
  if (!wedding) notFound()

  return (
    <>
      <div className="mx-auto max-w-5xl px-6 pt-8">
        <WeddingHeader wedding={wedding} />
        <WeddingTabs weddingId={id} />
      </div>
      {children}
    </>
  )
}
