import { InlineError } from '@guestnote/ui/inline-error'

export function Default() {
  return <InlineError>Enter a valid email address.</InlineError>
}

export function LongMessage() {
  return (
    <InlineError>
      We couldn't verify this code — check the six digits and try again.
    </InlineError>
  )
}
