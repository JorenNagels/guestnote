/**
 * The dashboard shell placeholder, at `app.guestnote.be/`.
 *
 * The content is deliberately the six RSVP status chips and a table, not "Hello world".
 * research/08-design-system.md machine-verified those exact values in both modes
 * (light 5.83-6.15:1, dark 6.92-7.09:1), so rendering them is the cheapest honest proof
 * that the token layer, the `@theme` mapping and Tailwind's source scanning are all
 * actually wired up -- a blank page proves none of it.
 *
 * Both modes are on screen at once rather than behind a toggle: `.dark` re-declares the
 * same custom properties, so a nested `.dark` container re-resolves them for its own
 * subtree.
 *
 * Note that the custom-property cascade would work even WITHOUT the
 * `@custom-variant dark (&:is(.dark *))` line added to design-system/tokens.css -- so
 * the panels alone do not prove that fix. The `dark:` pair in `VariantProbe` does: it is
 * the only thing here that compiles an actual `dark:` utility, and if the variant were
 * still keyed on `prefers-color-scheme` both panels would report the same thing instead
 * of disagreeing.
 *
 * Replaced at M3 by the real shell: session, org switcher, wedding list.
 */

const STATUSES = [
  { key: 'attending', label: 'Aanwezig', note: 'the happy path' },
  { key: 'declined', label: 'Afgemeld', note: 'NEUTRAL, not red -- a polite no is not an error' },
  { key: 'awaiting', label: 'Nog geen antwoord', note: "the planner's actual work queue" },
  { key: 'partial', label: 'Gedeeltelijk', note: 'needs a look, not a chase' },
  { key: 'plusone', label: '+1 naamloos', note: 'an action item; the brand gold earns its keep' },
  { key: 'alert', label: 'Bounced', note: 'red is reserved for things genuinely broken' },
] as const

/** Tailwind cannot see a class name built by string concatenation, so map explicitly. */
const CHIP_CLASSES: Record<(typeof STATUSES)[number]['key'], { chip: string; dot: string }> = {
  attending: { chip: 'bg-st-attending-bg text-st-attending-fg', dot: 'bg-st-attending-dot' },
  declined: { chip: 'bg-st-declined-bg text-st-declined-fg', dot: 'bg-st-declined-dot' },
  awaiting: { chip: 'bg-st-awaiting-bg text-st-awaiting-fg', dot: 'bg-st-awaiting-dot' },
  partial: { chip: 'bg-st-partial-bg text-st-partial-fg', dot: 'bg-st-partial-dot' },
  plusone: { chip: 'bg-st-plusone-bg text-st-plusone-fg', dot: 'bg-st-plusone-dot' },
  alert: { chip: 'bg-st-alert-bg text-st-alert-fg', dot: 'bg-st-alert-dot' },
}

function StatusChip({ status }: { status: (typeof STATUSES)[number] }) {
  const { chip, dot } = CHIP_CLASSES[status.key]
  return (
    // Dot AND label, never colour alone. Two reasons beyond WCAG 1.4.1: the
    // planner-facing exports get printed in mono, and a status column that only means
    // something in colour is useless on a venue's black-and-white printout.
    <span
      className={`${chip} inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm`}
      title={status.note}
    >
      <span className={`${dot} size-2 rounded-full`} aria-hidden="true" />
      {status.label}
    </span>
  )
}

/**
 * Exercises the `dark:` variant itself, which nothing else on this page does.
 *
 * With `@custom-variant dark (&:is(.dark *))` in place these two spans disagree between
 * the panels, because the variant matches the CLASS. Without it the variant falls back to
 * `prefers-color-scheme` and both panels report whatever the OS is set to -- the exact
 * silent mismatch that would have made every ported shadcn component wrong.
 */
function VariantProbe() {
  return (
    <p className="mt-4 text-sm">
      <span className="text-muted-foreground">dark: variant reports </span>
      <span className="font-medium dark:hidden">light</span>
      <span className="hidden font-medium dark:inline">dark</span>
    </p>
  )
}

function TokenPanel({ mode }: { mode: 'light' | 'dark' }) {
  return (
    <section
      className={`${mode === 'dark' ? 'dark' : ''} bg-background text-foreground flex-1 rounded-lg border p-6`}
    >
      <h2 className="text-lg font-semibold">{mode === 'dark' ? 'Dark' : 'Light'}</h2>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <StatusChip key={s.key} status={s} />
        ))}
      </div>

      <VariantProbe />

      {/* Row separation by hairline, not zebra: zebra fights the status chips and breaks
          when rows are filtered. And the numeric column is right-aligned with
          tabular-nums via @layer base, so headcounts line up with no per-table work. */}
      <table className="bg-card mt-6 w-full border-collapse rounded-md text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="px-3 py-2 font-medium">Bruidspaar</th>
            <th className="num px-3 py-2 font-medium">Gasten</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="px-3 py-2">Els &amp; Jan</td>
            <td className="num px-3 py-2">142</td>
            <td className="px-3 py-2">
              <StatusChip status={STATUSES[0]} />
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2">Paulien &amp; Sander</td>
            <td className="num px-3 py-2">98</td>
            <td className="px-3 py-2">
              <StatusChip status={STATUSES[2]} />
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

export default function ProHome() {
  return (
    <main className="bg-background text-foreground min-h-screen p-8">
      <h1 className="text-2xl font-semibold">Guestnote</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Dashboard placeholder. Served on the app host, rewritten to <code>/pro</code>, and returned{' '}
        <code>private, no-store</code>.
      </p>

      <div className="mt-8 flex flex-col gap-6 lg:flex-row">
        <TokenPanel mode="light" />
        <TokenPanel mode="dark" />
      </div>
    </main>
  )
}
