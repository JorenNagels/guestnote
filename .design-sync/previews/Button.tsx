import { Button } from '@guestnote/ui/button'

export function Primary() {
  return <Button variant="primary">Send invitation</Button>
}

export function Secondary() {
  return <Button variant="secondary">Cancel</Button>
}

export function Busy() {
  return (
    <Button variant="primary" busy busyLabel="Sending…">
      Send invitation
    </Button>
  )
}

export function Disabled() {
  return (
    <Button variant="primary" disabled>
      Send invitation
    </Button>
  )
}
