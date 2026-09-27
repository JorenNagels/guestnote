/**
 * Who runs Guestnote: the details Belgian law requires on the website (WER art. XII.6) and that
 * the terms and privacy notice name as the contracting party and the controller (spec 0006,
 * "Operator").
 *
 * **Every field starts null, and while any one is null the imprint renders nothing** -- the
 * user's call, 2026-09-27: the eenmanszaak is not registered yet, and a half-filled imprint
 * reads worse than none on staging. The cost is that nothing mechanical stops the apex going
 * live without it; the cutover checklist in `infra/README.md` carries that line instead, and
 * the fine is EUR 50-5,000 per missing element.
 *
 * A committed constant and not `env.ts`, which the plan first proposed: these are public facts
 * printed on every page, identical in every environment, and marketing is prerendered at build
 * -- an environment variable would have to reach the build step, and a wrong one would be
 * invisible until someone read the footer. A commit is reviewable.
 */
export type Operator = Readonly<{
  /** The person trading, as registered at the KBO. */
  name: string | null
  /** "Guestnote", the trade name the eenmanszaak trades under. */
  tradeName: string
  /** Street, number, postcode, municipality -- the registered seat, as one line. */
  address: string | null
  /** Ondernemingsnummer, `0123.456.789`. */
  kbo: string | null
  /**
   * `BE0123456789`, or `exempt` under the small-business VAT exemption
   * (bijzondere vrijstellingsregeling kleine ondernemingen, art. 56bis WBTW).
   */
  vat: string | 'exempt' | null
  email: string
}>

export const OPERATOR: Operator = {
  name: null,
  tradeName: 'Guestnote',
  address: null,
  kbo: null,
  vat: null,
  email: 'hello@guestnote.be',
}

export type CompleteOperator = { readonly [K in keyof Operator]: NonNullable<Operator[K]> }

/** The operator, or null while any legally required field is still unset. */
export function completeOperator(op: Operator = OPERATOR): CompleteOperator | null {
  const { name, address, kbo, vat } = op
  if (!name || !address || !kbo || !vat) return null
  return { ...op, name, address, kbo, vat }
}

export const CONTACT_EMAIL = OPERATOR.email
