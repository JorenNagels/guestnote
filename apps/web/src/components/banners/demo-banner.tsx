/**
 * "Guestnote is in demo" (spec 0005): shown on every app page while `GUESTNOTE_BILLING_FROM`
 * is unset, and not dismissible, so reporting a problem is always one click away.
 *
 * The trial banner's neutral state from the design (white, a hairline under it, a grey mono
 * pill), so the slot looks the same whichever of the two fills it once billing is on. Tokens,
 * not the design's hex values: `--card`, `--border`, `--muted`.
 *
 * `onReport` is absent when there is no inbox to send to (`SENTRY_DSN` unset) -- the banner
 * still says demo, and does not offer a button that would go nowhere.
 */
export function DemoBanner({
  labels,
  onReport,
}: {
  labels: { pill: string; body: string; ask: string; action: string }
  onReport?: (() => void) | undefined
}) {
  return (
    <section
      aria-label={labels.pill}
      className="bg-card border-border flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2 text-[0.8125rem] md:px-[30px] print:hidden"
    >
      <span className="bg-muted rounded-full px-2 py-0.5 font-mono text-[0.6875rem] font-semibold tracking-[0.04em]">
        {labels.pill}
      </span>
      {/* The question is part of the offer, so it goes where the button goes: without an inbox
          "Something off?" would be a question with nowhere to answer it. */}
      <span className="min-w-0 flex-1">
        {labels.body}
        {onReport ? ` ${labels.ask}` : null}
      </span>
      {onReport ? (
        <button
          type="button"
          onClick={onReport}
          className="bg-card border-border hover:border-foreground focus-visible:outline-ring h-[30px] cursor-pointer rounded-[var(--radius)] border px-3 text-[0.8125rem] font-medium outline-none focus-visible:outline-2"
        >
          {labels.action}
        </button>
      ) : null}
    </section>
  )
}
