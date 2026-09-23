import { LinkButton } from '@guestnote/ui/button'

export function Default() {
  return <LinkButton>Use a different email</LinkButton>
}

export function Disabled() {
  return <LinkButton disabled>Resend code (0:45)</LinkButton>
}
