'use client'

import type { ReactNode, SelectHTMLAttributes } from 'react'

/**
 * A native `<select>` in the `Field` skin. `packages/ui` has no select, and a listbox built from
 * divs would need its own keyboard model for a list of a dozen entries; the native one is
 * announced, searchable by typing and works on a phone. Slice-local because one consumer is not
 * yet a reason to grow the ui package (the F2 kit is shared and closed for this build).
 */
export function SelectField({
  label,
  id,
  invalid,
  errorId,
  children,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
  label: ReactNode
  id: string
  invalid?: boolean
  errorId?: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        {...rest}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid && errorId ? errorId : undefined}
        className={[
          'h-11 w-full rounded-[var(--radius)] border bg-transparent px-2.5 text-base',
          'text-foreground enabled:cursor-pointer hover:border-foreground',
          invalid ? 'border-destructive' : 'border-input',
        ].join(' ')}
      >
        {children}
      </select>
    </div>
  )
}

/** The text under a field that says what to type. Muted, and tied to the input by `id`. */
export function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
      {children}
    </p>
  )
}
