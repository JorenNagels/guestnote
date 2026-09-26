import { describe, expect, it } from 'vitest'
import { indicatorIndex, type SignupState, signupStep } from './signup-step.ts'

const base: SignupState = {
  signedIn: true,
  ownsStudio: false,
  pendingInvitations: 0,
  own: false,
  step: undefined,
}

describe('signupStep', () => {
  it('asks a visitor with no session for their account, whatever the query says', () => {
    expect(signupStep({ ...base, signedIn: false })).toBe('account')
    expect(signupStep({ ...base, signedIn: false, step: 'team', own: true })).toBe('account')
  })

  it('shows the invitations to someone who has any', () => {
    expect(signupStep({ ...base, pendingInvitations: 2 })).toBe('invited')
  })

  it('skips the invitations when they chose to start their own studio', () => {
    expect(signupStep({ ...base, pendingInvitations: 2, own: true })).toBe('studio')
  })

  it('names the studio when there is nothing else to show', () => {
    expect(signupStep(base)).toBe('studio')
  })

  it('does not let a ?step skip the studio when there is none', () => {
    // Nothing to add a wedding or a colleague to yet.
    expect(signupStep({ ...base, step: 'wedding' })).toBe('studio')
    expect(signupStep({ ...base, step: 'ready', pendingInvitations: 1 })).toBe('invited')
  })

  it('sends an owner with no ?step home: one studio per owner', () => {
    expect(signupStep({ ...base, ownsStudio: true })).toBe('home')
  })

  it('sends an owner home even with invitations waiting', () => {
    // Owning is checked first: an invited owner joins from the mail's link.
    expect(signupStep({ ...base, ownsStudio: true, pendingInvitations: 3 })).toBe('home')
  })

  it.each(['wedding', 'team', 'ready'] as const)('opens ?step=%s for an owner', (step) => {
    expect(signupStep({ ...base, ownsStudio: true, step })).toBe(step)
  })

  it('ignores a ?step it does not know', () => {
    expect(signupStep({ ...base, ownsStudio: true, step: 'studio' })).toBe('home')
    expect(signupStep({ ...base, ownsStudio: true, step: 'billing' })).toBe('home')
  })
})

describe('indicatorIndex', () => {
  it('keeps Verify and Invited under Account, and Ready on Team', () => {
    expect(indicatorIndex('account')).toBe(0)
    expect(indicatorIndex('invited')).toBe(0)
    expect(indicatorIndex('studio')).toBe(1)
    expect(indicatorIndex('wedding')).toBe(2)
    expect(indicatorIndex('team')).toBe(3)
    expect(indicatorIndex('ready')).toBe(3)
  })
})
