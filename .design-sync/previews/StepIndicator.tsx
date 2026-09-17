import { StepIndicator } from '@guestnote/ui/step-indicator'

const STEPS = ['Public', 'Verifying', 'Private']

export function Identify() {
  return <StepIndicator steps={STEPS} current={0} />
}

export function Verify() {
  return <StepIndicator steps={STEPS} current={1} />
}

export function Arrive() {
  return <StepIndicator steps={STEPS} current={2} />
}
