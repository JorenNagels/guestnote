import { Badge } from '@guestnote/ui/badge'
import { cx } from '@guestnote/ui/cx'
import { SmallButton } from './controls.tsx'
import type { CategoryFacet, FilterLabels } from './filters.ts'

export type ChipOption = { readonly value: string; readonly label: string; readonly count: number }

/**
 * One row of filter chips: "All", then one per option, each with its count. One tap filters.
 *
 * Toggle buttons (`aria-pressed`) in a named group, and not `Tabs` from the kit: a tablist
 * promises a panel per tab and arrow keys that move between them, and these narrow one table
 * that also answers to a search box. Not links either -- `filters.ts` says why the choice is
 * state mirrored into the URL rather than a navigation. The look is the checklist's filter
 * pills (`tasks/checklist.tsx`), so the two filter rows in the app read as one control; the
 * count is the kit's `Badge`, so it never reads as a status.
 *
 * Pressing the chip that is already pressed does nothing rather than toggling back to "All":
 * "All" is always one tap away at the start of the row, and a second tap on a chip should not
 * quietly undo the first.
 */
export function FilterChips({
  label,
  allLabel,
  total,
  options,
  value,
  onChange,
}: {
  /** The group's accessible name, e.g. "Filter by category". */
  label: string
  allLabel: string
  /** What "All" shows: the rows the other filters let through. */
  total: number
  options: readonly ChipOption[]
  /** The pressed option's `value`, or `null` for "All". */
  value: string | null
  onChange: (value: string | null) => void
}) {
  return (
    // A fieldset with a hidden legend is the group's name without a `role` (Biome's
    // `useSemanticElements`); `min-w-0` undoes a fieldset's min-content width, which would
    // otherwise stop the chips wrapping on a phone.
    <fieldset className="flex min-w-0 flex-wrap items-center gap-1.5">
      <legend className="sr-only">{label}</legend>
      <Chip
        pressed={value === null}
        label={allLabel}
        count={total}
        onClick={() => onChange(null)}
      />
      {options.map((o) => (
        <Chip
          key={o.value}
          pressed={o.value === value}
          label={o.label}
          count={o.count}
          onClick={() => onChange(o.value)}
        />
      ))}
    </fieldset>
  )
}

function Chip({
  pressed,
  label,
  count,
  onClick,
}: {
  pressed: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.78rem] transition-colors',
        // Filled AND bold when pressed, not only tinted: never colour alone (the Pill's rule).
        pressed
          ? 'border-primary bg-primary text-primary-foreground font-semibold'
          : 'border-input hover:border-foreground',
        // A chip that would show nothing stays tappable -- its row might be one search
        // away -- but steps back so the eye goes to the ones that would.
        !pressed && count === 0 && 'text-muted-foreground',
      )}
    >
      {/* The space is for the accessible name, "Catering 3" and not "Catering3"; the flex gap
          already spaces it on screen (the weddings list's view links do the same). */}
      {label} <Badge tone={pressed ? 'primary' : 'neutral'}>{count}</Badge>
    </button>
  )
}

/**
 * The category row, drawn only where it can narrow anything: one category is the whole list
 * already. Still drawn with one if that one is pressed -- otherwise "All" would disappear from
 * under a planner who just archived the last vendor of every other category.
 */
export function CategoryChips({
  facets,
  active,
  total,
  labels,
  onChange,
  className,
}: {
  facets: readonly CategoryFacet[]
  active: string | null
  total: number
  labels: FilterLabels
  /** The chip's label, which is what goes in the URL; `''` for "All". */
  onChange: (label: string) => void
  className?: string
}) {
  if (facets.length < 2 && active === null) return null
  return (
    <div className={className}>
      <FilterChips
        label={labels.category}
        allLabel={labels.all}
        total={total}
        options={facets.map((f) => ({ value: f.key, label: f.label, count: f.count }))}
        value={active}
        onChange={(key) => onChange(facets.find((f) => f.key === key)?.label ?? '')}
      />
    </div>
  )
}

/** Filters that leave nothing, with the one way out, so the table never just goes blank. */
export function NoMatch({ labels, onClear }: { labels: FilterLabels; onClear: () => void }) {
  return (
    <div className="py-8 text-center">
      <p className="text-muted-foreground text-sm">{labels.noMatch}</p>
      <SmallButton className="mt-3" onClick={onClear}>
        {labels.clear}
      </SmallButton>
    </div>
  )
}
