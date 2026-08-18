export type StageAtom = { key: string; label: string }

export type StageContent = {
  label: string
  couple: string
  date: string
  days: number
  unit: string
  atoms: readonly StageAtom[]
}

/**
 * The panel beside the form.
 *
 * Everything on it is drawn from things that already exist and are already verified: the
 * six RSVP status triples from design-system/tokens.css, the two brand hues via their
 * ramps, and the T-minus mechanic the task engine runs on. Nothing here is a claim.
 *
 * Tailwind cannot see a class name built by string concatenation, so the status classes
 * are mapped explicitly -- the same reason app/pro/page.tsx maps them.
 */
const CHIP: Record<string, { chip: string; dot: string }> = {
  attending: { chip: 'bg-st-attending-bg text-st-attending-fg', dot: 'bg-st-attending-dot' },
  awaiting: { chip: 'bg-st-awaiting-bg text-st-awaiting-fg', dot: 'bg-st-awaiting-dot' },
  plusone: { chip: 'bg-st-plusone-bg text-st-plusone-fg', dot: 'bg-st-plusone-dot' },
  declined: { chip: 'bg-st-declined-bg text-st-declined-fg', dot: 'bg-st-declined-dot' },
  partial: { chip: 'bg-st-partial-bg text-st-partial-fg', dot: 'bg-st-partial-dot' },
}

/**
 * Where each chip sits, how far it drifts, and how slowly.
 *
 * Hand-placed rather than random: they have to stay clear of the card at the centre at
 * every viewport this panel is shown at, and a seeded random would still need checking by
 * eye. The durations are mutually prime-ish so the group never falls into lockstep, which
 * is what makes a drift read as floating rather than as a carousel.
 */
const PLACEMENT: Record<string, string> = {
  attending: '--x:9%;  --y:17%; --dx:6px;  --dy:-16px; --dur:11s; --delay:0s',
  awaiting: '--x:57%; --y:9%;  --dx:-8px; --dy:-12px; --dur:9s;  --delay:.6s',
  plusone: '--x:72%; --y:31%; --dx:5px;  --dy:-18px; --dur:13s; --delay:1.4s',
  declined: '--x:7%;  --y:66%; --dx:-6px; --dy:-11px; --dur:10s; --delay:.9s',
  partial: '--x:63%; --y:77%; --dx:7px;  --dy:-15px; --dur:12s; --delay:.3s',
}

function style(decls: string): Record<string, string> {
  return Object.fromEntries(
    decls
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const at = d.indexOf(':')
        return [d.slice(0, at).trim(), d.slice(at + 1).trim()]
      }),
  )
}

export function Stage({ rung, content }: { rung: 0 | 1 | 2; content: StageContent }) {
  return (
    // Decorative in full. Everything it says is said again in the form beside it, so a
    // screen reader that walked it would hear a second, wordless copy of the page.
    <aside className="stage" data-rung={rung} aria-hidden="true">
      <div className="stage-sky" />
      <div className="stage-grid" />

      <ul className="stage-atoms">
        {content.atoms.map((atom) => {
          const c = CHIP[atom.key]
          const place = PLACEMENT[atom.key]
          if (!c || !place) return null
          return (
            <li key={atom.key} className={`atom ${c.chip}`} style={style(place)}>
              <span className={`atom-dot ${c.dot}`} />
              {atom.label}
            </li>
          )
        })}
      </ul>

      <div className="stage-card">
        <div className="stage-card-label">{content.label}</div>
        <div className="stage-card-title">{content.couple}</div>
        <div className="stage-card-date">{content.date}</div>
        <div className="stage-card-tminus">
          <b>{content.days}</b>
          <span>{content.unit}</span>
        </div>
      </div>
    </aside>
  )
}
