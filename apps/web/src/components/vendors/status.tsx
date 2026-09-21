import { Pill, type PillTone } from '@guestnote/ui/pill'
import type { VENDOR_STATUSES } from '../../lib/vendor-input.ts'

export type VendorStatus = (typeof VENDOR_STATUSES)[number]

/**
 * Tone by meaning, not by rank. `declined` is `danger` because it means a replacement is
 * needed, which is the one status here that asks the planner to do something; `considering`
 * is `neutral` on purpose so a fresh list does not read as a fire (the Pill's own rule).
 * The word always travels with the dot -- the tone is never the only signal.
 */
export const STATUS_TONE: Record<VendorStatus, PillTone> = {
  considering: 'neutral',
  contacted: 'info',
  quoted: 'warning',
  booked: 'success',
  declined: 'danger',
}

export type StatusLabels = Record<VendorStatus, string>

export function StatusPill({ status, labels }: { status: VendorStatus; labels: StatusLabels }) {
  return <Pill tone={STATUS_TONE[status]}>{labels[status]}</Pill>
}
