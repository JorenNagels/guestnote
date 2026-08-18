/**
 * The six colour slots every control in this package reads.
 *
 * Each falls back to the semantic token of the same meaning, so a component dropped on
 * an ordinary page needs no setup at all. A surface that moves its own ground overrides
 * the slots on one ancestor and every control below follows.
 *
 * Nothing overrides them today. The sign-in flow did, until its descent moved off the
 * form and onto the panel beside it -- so the form now sits on the ordinary background
 * and every fallback applies. The mechanism stays because it is what makes that kind of
 * move a one-file change instead of a rewrite of every control.
 *
 * The alternative was a `variant="on-dark"` prop threaded through every component, which
 * puts the surface's business in the component's API and breaks the moment there are
 * three grounds instead of two.
 *
 * Kept as documentation rather than code: Tailwind cannot see a class name it did not
 * find as a literal, so the class strings below are written out in full at each use.
 *
 *   --gn-fg         var(--foreground)
 *   --gn-muted      var(--muted-foreground)
 *   --gn-input      var(--input)
 *   --gn-action     var(--primary)
 *   --gn-action-fg  var(--primary-foreground)
 *   --gn-error      var(--destructive)
 */
export const SLOT_DOCS = 'see packages/ui/src/slots.ts' as const
