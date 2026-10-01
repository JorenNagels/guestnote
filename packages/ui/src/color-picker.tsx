'use client'

import { type ChangeEvent, type ClipboardEvent, useId, useState } from 'react'
import { cx } from './cx.ts'

/**
 * The wedding colours on offer, as `#RRGGBB` uppercase. The one place in this package
 * that holds raw hex, because a wedding's colour is data the planner chose, not a token.
 *
 * They are the six dot colours from the prototype (teal, gold, clay, sky, moss, plum). A
 * colour is a dot or a stripe -- never text, and a ground behind text only as the run sheet's 12%
 * mix into the card (spec 0004), whose ceiling keeps AA for any hex -- so there is no contrast
 * rule an arbitrary custom pick could fail. Not
 * checked against the dark ground; a dark-theme dot may want a lighter step later.
 */
export const COLOR_PRESETS = [
  '#206560',
  '#886A20',
  '#A94F4A',
  '#2F5C85',
  '#417E50',
  '#6C4A72',
] as const

const HEX = /^#[0-9A-Fa-f]{6}$/

/**
 * `#rrggbb` in any case to `#RRGGBB`, or null for anything else. The server stores
 * uppercase and checks `^#[0-9A-F]{6}$`, and a native colour input reports lowercase, so
 * this is the one place the two are reconciled. Shorthand (`#abc`) is refused rather than
 * expanded: the input never produces it, and guessing would hide a caller bug.
 */
export function normalizeHex(input: string): string | null {
  return HEX.test(input) ? input.toUpperCase() : null
}

/**
 * What a person typed or pasted into the hex field, to `#RRGGBB`, or null.
 *
 * Wider than `normalizeHex` on purpose: that one reconciles a machine (the native input),
 * this one a person, who pastes `12ab9f` from a brand sheet, `#12AB9F ` with the trailing
 * space a PDF adds, or the CSS shorthand `#abc`. Shorthand is expanded here and refused
 * there because here it is a spec-defined spelling a human uses, not a caller bug to hide.
 */
export function parseHexInput(raw: string): string | null {
  const s = raw.trim().replace(/^#/, '')
  if (/^[0-9A-Fa-f]{3}$/.test(s)) {
    return `#${[...s].map((c) => c + c).join('')}`.toUpperCase()
  }
  return normalizeHex(`#${s}`)
}

// What the native input holds while nothing custom is chosen. Never seen -- the rainbow ring
// covers it -- but a colour input has to hold some value, and it is where the OS picker opens.
const UNSET = '#8A8580'

// The custom slot's ring. A hue wheel is the one mark that says "any colour" without words:
// iOS's UIColorWell and most OS pickers use it, where the mid-grey circle this replaced read
// as a seventh, disabled preset (planner feedback, 2026-10-02).
const RAINBOW =
  'conic-gradient(from 0deg, #E5484D, #F2A23A, #E9D23C, #46A758, #3E9FD8, #6E56CF, #D6409F, #E5484D)'

type Props = {
  /** The group's accessible name. */
  label: string
  /** The name of the native colour input, for "any other colour". Also its hover title. */
  customLabel: string
  /** The name of the hex text field. */
  hexLabel: string
  /** The current colour, or null for none chosen. Any case; compared case-insensitively. */
  value: string | null
  /** Always `#RRGGBB` uppercase. */
  onChange: (hex: string) => void
  /**
   * Names a swatch for assistive technology. Defaults to the hex, which is accurate but
   * not friendly; the app passes translated colour names.
   */
  swatchLabel?: (hex: string) => string
  className?: string
}

/**
 * A row of preset swatches, a custom swatch over a native colour input, and a hex field.
 *
 * The swatches are real radio inputs, so arrow keys, a single tab stop and the checked
 * state are the browser's and not ours. The alternative, `role="radio"` on buttons with a
 * hand-written roving tabindex, is more code that has to be right to end up where this
 * starts.
 *
 * `onChange` fires on every `input` event from the native picker, which is continuously
 * while a person drags inside it. A caller that saves each change should hold the value in
 * state and save on a button, not on this callback. The hex field emits as soon as six digits
 * are in it, for the same reason: the save is the caller's button, so a live preview costs
 * nothing, and a commit-on-blur only would make a paste look ignored until focus moved.
 */
export function ColorPicker({
  label,
  customLabel,
  hexLabel,
  value,
  onChange,
  swatchLabel = (hex) => hex,
  className,
}: Props) {
  const name = useId()
  const current = value === null ? null : normalizeHex(value)
  const isPreset = current !== null && (COLOR_PRESETS as readonly string[]).includes(current)

  const isCustom = current !== null && !isPreset
  // What the hex field shows while a person is editing it; null means "mirror the value".
  // Mirroring rather than syncing with an effect, so a swatch click shows up in the field
  // on the same render and there is no second source of truth to drift.
  const [draft, setDraft] = useState<string | null>(null)
  const invalid = draft !== null && draft.trim() !== '' && parseHexInput(draft) === null

  const emit = (e: ChangeEvent<HTMLInputElement>) => {
    const hex = normalizeHex(e.target.value)
    setDraft(null)
    if (hex) onChange(hex)
  }

  // Live only on six digits. Shorthand waits for the field to be left, because "12a" is also
  // the first half of "12ab9f": expanding it as typed would flash #1122AA on the way there.
  const type = (raw: string) => {
    setDraft(raw)
    const hex = normalizeHex(`#${raw.trim().replace(/^#/, '')}`)
    if (hex) onChange(hex)
  }

  // A paste replaces the field rather than inserting at the caret: nobody pastes half a
  // colour, and an insert into "206560" would make twelve digits and look refused.
  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    const hex = parseHexInput(e.clipboardData.getData('text'))
    if (!hex) return
    e.preventDefault()
    setDraft(hex.slice(1))
    onChange(hex)
  }

  return (
    <fieldset className={cx('m-0 min-w-0 border-0 p-0', className)}>
      <legend className="mb-1.5 p-0 text-sm font-medium text-[color:var(--gn-fg,var(--foreground))]">
        {label}
      </legend>
      <div className="flex flex-wrap items-center gap-2.5">
        {COLOR_PRESETS.map((hex) => (
          <label key={hex} className="relative inline-flex cursor-pointer">
            <input
              type="radio"
              name={name}
              value={hex}
              checked={current === hex}
              onChange={emit}
              aria-label={swatchLabel(hex)}
              className="peer sr-only"
            />
            {/* Inline style is the exception to "never inline": a class name cannot carry an
                arbitrary hex, and Tailwind would need every preset written out to see it. */}
            <span
              aria-hidden="true"
              style={{ backgroundColor: hex }}
              className={cx(
                'size-7 rounded-full border border-border transition-shadow',
                'peer-checked:ring-2 peer-checked:ring-[var(--gn-fg,var(--foreground))] peer-checked:ring-offset-2',
                'peer-checked:ring-offset-[var(--background)]',
                'peer-focus-visible:outline-[length:var(--ring-width)] peer-focus-visible:outline-solid',
                'peer-focus-visible:outline-[var(--ring)] peer-focus-visible:outline-offset-[var(--ring-offset)]',
              )}
            />
          </label>
        ))}
        <label className="relative inline-flex cursor-pointer" title={customLabel}>
          <input
            type="color"
            aria-label={customLabel}
            // Native colour inputs accept lowercase `#rrggbb` only; anything else is
            // silently replaced with black.
            value={(current ?? UNSET).toLowerCase()}
            onChange={emit}
            // Invisible but on top and full size, so the click that opens the OS picker
            // lands on the input itself -- a forwarded `.click()` is refused by Safari.
            className="peer absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
          />
          <span
            aria-hidden="true"
            style={{ background: RAINBOW }}
            className={cx(
              'grid size-7 place-items-center rounded-full transition-shadow',
              'peer-focus-visible:outline-[length:var(--ring-width)] peer-focus-visible:outline-solid',
              'peer-focus-visible:outline-[var(--ring)] peer-focus-visible:outline-offset-[var(--ring-offset)]',
              // A custom colour has no preset swatch to ring, so this one takes the ring:
              // "this is the one that is chosen" has to show somewhere.
              isCustom &&
                'ring-2 ring-[var(--gn-fg,var(--foreground))] ring-offset-2 ring-offset-[var(--background)]',
            )}
          >
            {/* The ring stays when a custom colour is chosen, so the slot still reads as
                "your own" and not as a seventh preset that appeared. */}
            <span
              data-testid="custom-swatch"
              style={isCustom && current ? { backgroundColor: current } : undefined}
              className={cx(
                'grid size-[20px] place-items-center rounded-full',
                !isCustom && 'bg-[var(--background)] text-[color:var(--gn-fg,var(--foreground))]',
              )}
            >
              {isCustom ? null : (
                <svg viewBox="0 0 12 12" className="size-2.5" fill="none" aria-hidden="true">
                  <path
                    d="M6 1.5v9M1.5 6h9"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
          </span>
        </label>
        <div
          className={cx(
            'flex h-8 items-center rounded-full border bg-[var(--background)] pr-1 pl-3 font-mono text-[0.8125rem]',
            'focus-within:border-[var(--gn-fg,var(--foreground))]',
            invalid
              ? 'border-[var(--gn-error,var(--destructive))]'
              : 'border-[var(--gn-input,var(--input))]',
          )}
        >
          <span aria-hidden="true" className="text-[color:var(--gn-muted,var(--muted-foreground))]">
            #
          </span>
          <input
            type="text"
            aria-label={hexLabel}
            aria-invalid={invalid || undefined}
            value={draft ?? current?.slice(1) ?? ''}
            onChange={(e) => type(e.target.value)}
            onPaste={paste}
            // Leaving a field that parses commits it and shows it back in its stored spelling
            // (#abc becomes AABBCC); one that does not stays as typed, marked, so the
            // mistake is visible instead of silently reverted.
            onBlur={() => {
              if (invalid) return
              const hex = draft === null ? null : parseHexInput(draft)
              if (hex && hex !== current) onChange(hex)
              setDraft(null)
            }}
            placeholder="A94F4A"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={9}
            className="w-[7ch] min-w-0 border-0 bg-transparent p-0 pl-0.5 uppercase outline-none placeholder:text-[color:var(--gn-muted,var(--muted-foreground))]"
          />
        </div>
      </div>
    </fieldset>
  )
}
