'use client'

import { type ChangeEvent, useId } from 'react'
import { cx } from './cx.ts'

/**
 * The wedding colours on offer, as `#RRGGBB` uppercase. The one place in this package
 * that holds raw hex, because a wedding's colour is data the planner chose, not a token.
 *
 * They are the six dot colours from the prototype (teal, gold, clay, sky, moss, plum). A
 * colour is only ever a dot or a stripe -- never text, never a ground behind text
 * (spec 0003) -- so there is no contrast rule an arbitrary custom pick could fail. Not
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

// What the native input shows while nothing is chosen. It has to show something, and a
// mid grey says "not picked" better than any preset would.
const UNSET = '#8A8580'

type Props = {
  /** The group's accessible name. */
  label: string
  /** The name of the native colour input, for "any other colour". */
  customLabel: string
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
 * A row of preset swatches and a native colour input.
 *
 * The swatches are real radio inputs, so arrow keys, a single tab stop and the checked
 * state are the browser's and not ours. The alternative, `role="radio"` on buttons with a
 * hand-written roving tabindex, is more code that has to be right to end up where this
 * starts.
 *
 * `onChange` fires on every `input` event from the native picker, which is continuously
 * while a person drags inside it. A caller that saves each change should hold the value in
 * state and save on a button, not on this callback.
 */
export function ColorPicker({
  label,
  customLabel,
  value,
  onChange,
  swatchLabel = (hex) => hex,
  className,
}: Props) {
  const name = useId()
  const current = value === null ? null : normalizeHex(value)
  const isPreset = current !== null && (COLOR_PRESETS as readonly string[]).includes(current)

  const emit = (e: ChangeEvent<HTMLInputElement>) => {
    const hex = normalizeHex(e.target.value)
    if (hex) onChange(hex)
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
        <input
          type="color"
          aria-label={customLabel}
          // Native colour inputs accept lowercase `#rrggbb` only; anything else is
          // silently replaced with black.
          value={(current ?? UNSET).toLowerCase()}
          onChange={emit}
          className={cx(
            'size-7 cursor-pointer appearance-none rounded-full border bg-transparent p-0',
            '[&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0',
            '[&::-webkit-color-swatch-wrapper]:p-0',
            '[&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0',
            // A custom colour has no swatch to ring, so the input itself takes the ring:
            // "this is the one that is chosen" has to show somewhere.
            current !== null && !isPreset
              ? 'border-[var(--gn-fg,var(--foreground))] ring-2 ring-[var(--gn-fg,var(--foreground))] ring-offset-2 ring-offset-[var(--background)]'
              : 'border-[var(--gn-input,var(--input))]',
          )}
        />
      </div>
    </fieldset>
  )
}
