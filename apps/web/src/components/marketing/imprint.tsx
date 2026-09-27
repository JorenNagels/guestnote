import type { CompleteOperator } from '../../lib/operator.ts'

export type ImprintLabels = Readonly<{
  name: string
  tradeName: string
  form: string
  formValue: string
  address: string
  kbo: string
  vat: string
  vatExempt: string
  email: string
}>

type Props = {
  /** `completeOperator()`: null while any legally required field is unset. */
  readonly operator: CompleteOperator | null
  readonly labels: ImprintLabels
  /** `line` for the footer, `list` for the legal-notice and about pages. */
  readonly variant: 'line' | 'list'
}

/**
 * The details WER art. XII.6 requires on a Belgian business's website (spec 0006, "Operator").
 *
 * **Renders nothing while the operator is incomplete** -- the user's call for the period before
 * the eenmanszaak is registered. The pages that host a full imprint say where the details will
 * appear instead (`imprint.pending`); the footer simply has no line. Pure, so the gate is tested
 * without the constant in `lib/operator.ts` having to change.
 */
export function Imprint({ operator, labels, variant }: Props) {
  if (!operator) return null
  const vat = operator.vat === 'exempt' ? labels.vatExempt : operator.vat

  if (variant === 'line') {
    return (
      <p data-testid="imprint-line">
        {operator.tradeName} · {operator.name} · {labels.formValue} · {operator.address} ·{' '}
        {labels.kbo} {operator.kbo} · {vat}
      </p>
    )
  }

  const rows: ReadonlyArray<readonly [string, string]> = [
    [labels.tradeName, operator.tradeName],
    [labels.name, operator.name],
    [labels.form, labels.formValue],
    [labels.address, operator.address],
    [labels.kbo, operator.kbo],
    [labels.vat, vat],
    [labels.email, operator.email],
  ]
  return (
    <dl data-testid="imprint-list" className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
