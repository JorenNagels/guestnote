import type { BillingCycle } from '@guestnote/billing'
import type { PillTone } from '@guestnote/ui/pill'
import { InvoiceDetailsForm, type InvoiceDetailsLabels } from './invoice-details-form.tsx'
import { PlanCard, type PlanCardLabels } from './plan-card.tsx'
import type { InvoiceDetailsState, InvoiceDetailsValues, RedirectOutcome } from './types.ts'

export type InvoiceRow = {
  readonly id: string
  /** Formatted date. */
  readonly date: string
  readonly number: string
  /** Formatted amount. */
  readonly amount: string
  readonly pdfUrl: string | null
}

export type BillingScreenLabels = Readonly<{
  title: string
  /** The line under the title: trial end, or "Studio, billed monthly. Next invoice …". */
  status: string
  /** The green banner after a checkout return; null otherwise. Finished on the server. */
  success: string | null
  plan: PlanCardLabels
  details: InvoiceDetailsLabels
  invoices: Readonly<{
    title: string
    empty: string
    date: string
    number: string
    amount: string
    pdf: string
  }>
  notes: Readonly<{ title: string; seats: string; change: string; readOnly: string }>
}>

/**
 * `/billing` (spec 0005, "Billing"), laid out as the design draws it: a main column of cards
 * (Plan, Invoice details, Invoices) at least 520px wide, and a notes column at least 260px that
 * wraps under it on a narrow screen. Presentational: the page resolves everything, and the
 * component tests render the paid state and the success banner from fixtures -- the no-op
 * provider can reach neither.
 */
export function BillingScreen({
  labels,
  tone,
  paid,
  seats,
  vatNumber,
  cycle,
  moneyLocale,
  details,
  invoices,
  actions,
}: {
  labels: BillingScreenLabels
  tone: PillTone
  paid: boolean
  seats: number
  vatNumber: string | null
  cycle: BillingCycle
  moneyLocale: string
  details: InvoiceDetailsValues
  invoices: readonly InvoiceRow[]
  actions: {
    checkout: (cycle: BillingCycle) => Promise<RedirectOutcome>
    portal: () => Promise<RedirectOutcome>
    saveDetails: (prev: InvoiceDetailsState, fd: FormData) => Promise<InvoiceDetailsState>
  }
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{labels.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{labels.status}</p>
      </header>

      {labels.success ? (
        <p
          role="status"
          className="bg-st-attending-bg text-st-attending-fg border-st-attending-dot/40 mt-5 rounded-[var(--radius)] border px-4 py-2.5 text-sm"
        >
          {labels.success}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-5">
          <PlanCard
            labels={labels.plan}
            tone={tone}
            seats={seats}
            vatNumber={vatNumber}
            paid={paid}
            initialCycle={cycle}
            moneyLocale={moneyLocale}
            checkout={actions.checkout}
            portal={actions.portal}
          />
          <InvoiceDetailsForm
            initial={details}
            labels={labels.details}
            action={actions.saveDetails}
          />
          <section
            aria-labelledby="invoices-title"
            className="bg-card border-border rounded-[var(--radius)] border px-[18px] py-4"
          >
            <h2 id="invoices-title" className="mb-3 text-[14.5px] font-semibold">
              {labels.invoices.title}
            </h2>
            {invoices.length === 0 ? (
              <p className="text-muted-foreground text-sm">{labels.invoices.empty}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sr-only">
                  <tr>
                    <th>{labels.invoices.date}</th>
                    <th>{labels.invoices.number}</th>
                    <th>{labels.invoices.amount}</th>
                    <th>{labels.invoices.pdf}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id} className="border-border border-t first:border-t-0">
                      <td className="py-2">{i.date}</td>
                      <td className="py-2 font-mono">{i.number}</td>
                      <td className="py-2 text-right font-mono tabular-nums">{i.amount}</td>
                      <td className="py-2 pl-4 text-right">
                        {i.pdfUrl ? (
                          <a
                            href={i.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2"
                          >
                            {labels.invoices.pdf}
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <aside
          aria-labelledby="notes-title"
          className="bg-card border-border flex-[1_1_260px] rounded-[var(--radius)] border px-[18px] py-4 text-sm"
        >
          <h2 id="notes-title" className="mb-2 text-[14.5px] font-semibold">
            {labels.notes.title}
          </h2>
          <ul className="text-muted-foreground flex list-none flex-col gap-2 p-0">
            <li>{labels.notes.seats}</li>
            <li>{labels.notes.change}</li>
            <li>{labels.notes.readOnly}</li>
          </ul>
        </aside>
      </div>
    </div>
  )
}
