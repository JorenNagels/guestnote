/**
 * "4 / 7" on the overview (spec 0009 C2): vendors booked over every vendor still in play.
 *
 * Declined is left out of the whole, and only declined: a vendor the couple turned down is not
 * one the planner still has to book, so counting it would leave the figure short of "all booked"
 * forever. Considering, contacted and quoted all stay in -- they are the work still to do.
 * Rejected: counting only `booked` against `quoted`, which hides the vendors nobody has
 * contacted yet, the ones most likely to be forgotten.
 *
 * Takes the per-status counts `getWeddingGlance` returns, so this is the one place the rule is
 * written and a unit test reaches it without a database.
 */
export function vendorProgress(statuses: readonly { status: string; count: number }[]): {
  booked: number
  counted: number
} {
  let booked = 0
  let counted = 0
  for (const s of statuses) {
    if (s.status === 'declined') continue
    counted += s.count
    if (s.status === 'booked') booked += s.count
  }
  return { booked, counted }
}
