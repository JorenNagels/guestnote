import { useId } from 'react'
import { Field } from '@guestnote/ui/field'
import { InlineError } from '@guestnote/ui/inline-error'

export function Default() {
  return <Field label="Wedding date" placeholder="12 / 06 / 2027" />
}

export function Invalid() {
  const errorId = useId()
  return (
    <div>
      <Field
        label="Email address"
        defaultValue="not-an-email"
        invalid
        errorId={errorId}
      />
      <InlineError id={errorId}>Enter a valid email address.</InlineError>
    </div>
  )
}

export function NumericCode() {
  return <Field label="Verification code" numeric defaultValue="194720" />
}

export function ReadOnly() {
  return <Field label="Venue" defaultValue="Kasteel van Laarne" readOnly />
}
