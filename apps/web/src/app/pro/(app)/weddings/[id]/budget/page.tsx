import { getBudget } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { BudgetView } from '../../../../../../components/money/budget-view.tsx'
import { getDb } from '../../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../../lib/principal.ts'
import { isUuid } from '../../../../../../lib/uuid.ts'

/**
 * The budget of one wedding. `null` from the repo is a 404 and never a 403, for the reason
 * `../page.tsx` gives: a couple, an unassigned member and a wedding that does not exist must
 * be indistinguishable. A malformed id is a 404 as well, so it never reaches Postgres as a
 * uuid cast error.
 */
export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, memberships, orgId] = await Promise.all([
    params,
    currentMemberships(),
    currentOrgId(),
  ])
  if (!memberships || !orgId || !isUuid(id)) notFound()

  const data = await getBudget(getDb(), memberships, orgId, id)
  if (!data) notFound()

  return (
    <BudgetView
      weddingId={id}
      coupleName={data.wedding.coupleDisplayName}
      locale={data.wedding.locale}
      lines={data.lines}
      payments={data.payments}
      vendors={data.vendors}
    />
  )
}
