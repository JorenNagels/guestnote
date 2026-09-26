/**
 * Which sign-up screen `/signup` shows (spec 0005, Sign-up). A pure function of what the server
 * already knows, so the page has no client state to lose between steps and a reload always lands
 * where the planner is.
 *
 * ## Why the server decides, and the auth flow gets no callback
 *
 * `AuthFlow` ends every sign-in with a full navigation to its `continueHref`. Pointing that at
 * `/signup` and deriving the step here means the signed-in half of the flow is ordinary server
 * rendering: a reload, a back button or a second tab all agree, because none of them carries a
 * step the database does not. Rejected: a client-side wizard holding the step in state -- one
 * dropped connection at a venue and the planner is back at "Account" with a studio that exists.
 *
 * ## The order of the rules is the decision
 *
 *   1. No session: Account. Verify and Invited sit under it.
 *   2. A studio of their own and an explicit `?step`: that optional step. Only these three are
 *      addressable; a `?step` without a studio falls through, since there is nothing to add a
 *      wedding or a colleague to.
 *   3. A studio of their own and no `?step`: home. One studio per owner, and an abandoned sign-up
 *      after step 3 is a usable account, so revisiting `/signup` opens the dashboard.
 *   4. Pending invitations, unless they chose `?own=1`: the "You've been invited" choice.
 *   5. Otherwise: name the studio.
 *
 * Owning is checked before invitations on purpose: an owner who is also invited somewhere joins
 * from the link in the mail, and `/signup` has nothing left to offer them.
 */

export const OPTIONAL_STEPS = ['wedding', 'team', 'ready'] as const
export type OptionalStep = (typeof OPTIONAL_STEPS)[number]

export type SignupStep = 'account' | 'invited' | 'studio' | OptionalStep | 'home'

export type SignupState = {
  readonly signedIn: boolean
  readonly ownsStudio: boolean
  readonly pendingInvitations: number
  /** `?own=1`: "Start my own studio anyway". */
  readonly own: boolean
  /** The raw `?step` value; anything but the three optional steps is ignored. */
  readonly step: string | undefined
}

export function isOptionalStep(value: string | undefined): value is OptionalStep {
  return OPTIONAL_STEPS.some((s) => s === value)
}

export function signupStep(state: SignupState): SignupStep {
  if (!state.signedIn) return 'account'
  if (state.ownsStudio) return isOptionalStep(state.step) ? state.step : 'home'
  if (state.pendingInvitations > 0 && !state.own) return 'invited'
  return 'studio'
}

/**
 * Where the four-label indicator (Account · Studio · Wedding · Team) stands on each step. Ready
 * stands on Team, the last label, with every pip filled.
 */
export function indicatorIndex(step: Exclude<SignupStep, 'home'>): number {
  switch (step) {
    case 'account':
    case 'invited':
      return 0
    case 'studio':
      return 1
    case 'wedding':
      return 2
    case 'team':
    case 'ready':
      return 3
  }
}
