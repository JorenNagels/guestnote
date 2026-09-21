import { getPayments } from '@guestnote/db'
import { notFound } from 'next/navigation'
import { PaymentsView } from '../../../../../../components/money/payments-view.tsx'
import { getDb } from '../../../../../../lib/db.ts'
import { civilToday, isUuid } from '../../../../../../lib/money.ts'
import { currentMemberships, currentOrgId } from '../../../../../../lib/principal.ts'

/**
 * The payment schedule. "Today" is read from the real clock here, on every request, in the
 * wedding's own timezone -- this route is dynamic (it reads cookies for the principal), so a
 * planner who opens it after midnight sees the day's overdue and not yesterday's.
 * Rejected: computing it in the browser, which would let a wrong laptop clock change what
 * counts as late and would make the server render disagree with the hydrated one.
 */
export default async function PaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, memberships, orgId] = await Promise.all([
    params,
    currentMemberships(),
    currentOrgId(),
  ])
  if (!memberships || !orgId || !isUuid(id)) notFound()

  const data = await getPayments(getDb(), memberships, orgId, id)
  if (!data) notFound()

  return (
    <PaymentsView
      weddingId={id}
      wedding={data.wedding}
      today={civilToday(data.wedding.timezone)}
      payments={data.payments}
      lines={data.lines}
    />
  )
}
