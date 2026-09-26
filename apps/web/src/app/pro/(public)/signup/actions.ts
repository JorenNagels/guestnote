'use server'

import {
  acceptInvitationById,
  applyTemplate,
  createStudio,
  MAX_STUDIO_NAME,
  type Memberships,
  myPendingInvitations,
  resolveMemberships,
  seedTemplates,
  studioSettings,
} from '@guestnote/db'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import {
  type JoinOutcome,
  MAX_OWNER_NAME,
  type StudioFormState,
  TEAM_ROWS,
  type TeamFormState,
} from '../../../../components/signup/state.ts'
import { createWeddingFromForm } from '../../../../lib/create-wedding.ts'
import { getDb } from '../../../../lib/db.ts'
import { DEFAULT_LOCALE, isLocale } from '../../../../lib/locales.ts'
import { reportSilentFailure } from '../../../../lib/observability.ts'
import { ORG_COOKIE, PREF_COOKIE_OPTIONS } from '../../../../lib/prefs.ts'
import { currentSession } from '../../../../lib/principal.ts'
import { app } from '../../../../lib/routes.ts'
import { studioSlugFromName } from '../../../../lib/slug.ts'
import {
  type InviteFailure,
  inviteStaff,
  normaliseInviteEmail,
} from '../../../../lib/staff-invite.ts'
import { starterTemplates } from '../../../../lib/starter-templates.ts'
import { isUuid } from '../../../../lib/uuid.ts'
import type { FormState } from '../../../../lib/wedding-form-state.ts'

/**
 * Sign-up's Server Functions (spec 0005). A Server Function is a POST to its own route, so no
 * page or layout guards these (CLAUDE.md invariant 7): each resolves the session itself, and
 * the org it acts in is derived here, never taken from the client.
 *
 * ## Which org, and why not `currentOrgId()`
 *
 * After the studio step, the org is **the one this user owns** -- one studio per owner, and
 * `create_studio` refuses a second. Not the `gn_org` cookie: a planner who is staff at another
 * studio may still have it pointing there, and their first wedding would land in someone else's
 * book. The memberships are resolved fresh with `resolveMemberships`, not through the
 * request-cached `currentMemberships`: `createStudioAction` changes them mid-request, and a
 * cached answer from before the insert says they own nothing.
 *
 * Every repo call below then re-derives the principal from those rows (`principalForOrg`), so
 * "owns it" here picks the org and RLS still decides what may be done in it.
 */

const text = (fd: FormData, key: string): string => {
  const v = fd.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

/** The user's own studio, with memberships read now -- see the module comment. */
async function ownStudio(
  userId: string,
): Promise<{ memberships: Memberships; orgId: string } | null> {
  const memberships = await resolveMemberships(getDb(), userId)
  const owned = memberships.orgs.find((o) => o.role === 'owner')
  return owned ? { memberships, orgId: owned.orgId } : null
}

/**
 * The sidebar opens on the new studio. Without it `landingOrgId` picks deterministically among
 * every membership, and a planner who is also staff elsewhere could land in the other studio
 * right after creating their own.
 */
async function actIn(orgId: string): Promise<void> {
  ;(await cookies()).set(ORG_COOKIE, orgId, PREF_COOKIE_OPTIONS)
}

/**
 * Step "Studio": create the org with the caller as owner, seed the three starter templates in
 * the language they signed up in, and move on to the first wedding.
 *
 * A second submit (a double click, a back button) gets `alreadyOwner` from `create_studio` and
 * is sent forward to the same place the first one went: one studio, and no error for a planner
 * who did nothing wrong.
 */
export async function createStudioAction(
  _prev: StudioFormState,
  formData: FormData,
): Promise<StudioFormState> {
  const session = await currentSession()
  if (!session) return { form: 'forbidden' }

  const name = text(formData, 'name')
  const ownerName = text(formData, 'ownerName')
  const values = { name, ownerName }
  const errors: NonNullable<StudioFormState['errors']> = {}
  if (name === '') errors.name = 'required'
  else if (name.length > MAX_STUDIO_NAME) errors.name = 'tooLong'
  if (ownerName === '') errors.ownerName = 'required'
  else if (ownerName.length > MAX_OWNER_NAME) errors.ownerName = 'tooLong'
  if (Object.keys(errors).length > 0) return { errors, values }

  const created = await createStudio(getDb(), session.userId, {
    name,
    slugBase: studioSlugFromName(name),
    ownerName,
  })
  if (!created.ok) {
    if (created.reason === 'alreadyOwner') {
      // The first submit may have committed and then lost its response, so this one does the
      // part that makes the next screens act in the right studio. Not the seed: a studio whose
      // first request died between the insert and the seed keeps no starters, and says so in
      // the log below rather than guessing here whether they were ever there.
      const owned = await ownStudio(session.userId)
      if (owned) await actIn(owned.orgId)
      redirect(app.signupStep('wedding'))
    }
    return { form: created.reason === 'forbidden' ? 'forbidden' : 'failed', values }
  }

  const orgId = created.value.orgId
  const memberships = await resolveMemberships(getDb(), session.userId)
  const locale = await getLocale()
  // Seeding is not allowed to fail the sign-up: the studio exists and is usable without them,
  // and the next screen offers "Start empty" regardless. A refused or thrown seed is a bug in
  // the starter content (`starter-templates.test.ts` holds its limits), reported, not shown.
  const seeded = await seedTemplates(
    getDb(),
    memberships,
    orgId,
    starterTemplates(isLocale(locale) ? locale : DEFAULT_LOCALE),
  ).catch((error: unknown) => ({ ok: false as const, reason: String(error) }))
  if (!seeded.ok)
    reportSilentFailure('signup: starter templates not seeded', { orgId, reason: seeded.reason })

  await actIn(orgId)
  redirect(app.signupStep('wedding'))
}

/**
 * Step "First wedding": the in-app new-wedding path (`lib/create-wedding.ts`), then the chosen
 * starting plan. `template` is an id or blank for "Start empty"; `applyTemplate` reads it under
 * the caller's principal, so an id from another org is simply not found.
 */
export async function createFirstWeddingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await currentSession()
  if (!session) return { form: 'forbidden' }
  const studio = await ownStudio(session.userId)
  if (!studio) return { form: 'forbidden' }

  const created = await createWeddingFromForm(studio.memberships, studio.orgId, formData)
  if (!created.ok) return created.state

  const templateId = text(formData, 'template')
  if (isUuid(templateId)) {
    // The wedding exists either way; a plan that did not apply is one the planner can apply
    // from the checklist, so this does not hold them on the step.
    const applied = await applyTemplate(
      getDb(),
      studio.memberships,
      studio.orgId,
      templateId,
      created.id,
    )
    if (!applied.ok) {
      reportSilentFailure('signup: starting plan not applied', {
        orgId: studio.orgId,
        reason: applied.reason,
      })
    }
  }
  redirect(app.signupStep('team'))
}

/**
 * Step "Team": up to three colleagues, role `member`, through the Team screen's own core. Blank
 * rows are ignored; one invalid address blocks the whole send with an error on that row, before
 * the session is read or anything is written (spec 0005, Sign-up step 6).
 *
 * A row that was sent stays sent: a later failure on another row returns `sent` so the form
 * locks those rows and does not post them again as duplicates.
 */
export async function inviteTeamAction(
  prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const rows = Array.from({ length: TEAM_ROWS }, (_, i) => text(formData, `email${i}`))
  const errors: Record<number, InviteFailure> = {}
  const toSend: { index: number; email: string }[] = []
  rows.forEach((raw, index) => {
    if (raw === '') return
    const email = normaliseInviteEmail(raw)
    if (email) toSend.push({ index, email })
    else errors[index] = 'invalidEmail'
  })
  const alreadySent = prev.sent ?? []
  if (Object.keys(errors).length > 0) return { errors, sent: alreadySent, values: rows }

  const session = await currentSession()
  // `sent` rides along on every return, or a refusal here would unlock rows already invited.
  if (!session) return { form: 'forbidden', sent: alreadySent, values: rows }
  const studio = await ownStudio(session.userId)
  if (!studio) return { form: 'forbidden', sent: alreadySent, values: rows }

  const [settings, locale] = await Promise.all([
    studioSettings(getDb(), studio.memberships, studio.orgId),
    getLocale(),
  ])
  const sent = [...alreadySent]
  for (const { index, email } of toSend) {
    // Sequential: each is a row and a mail, and three is the most there can be.
    const outcome = await inviteStaff({
      memberships: studio.memberships,
      orgId: studio.orgId,
      orgName: settings?.name ?? '',
      inviter: session.name ?? session.email,
      locale,
      email,
      role: 'member',
    })
    if (outcome.ok) sent.push(index)
    else errors[index] = outcome.reason
  }
  if (Object.keys(errors).length > 0) return { errors, sent, values: rows }
  redirect(app.signupStep('ready'))
}

/**
 * "Join" on the invited screen. Only a STAFF invitation is joined here: a wedding invitation's
 * "Open" says the couple portal is not open yet, exactly as its link does, so accepting one
 * from this screen would be a second door with a different outcome. Checked against the
 * caller's own pending list, which `my_pending_invitations` matches by their verified email.
 *
 * Two gates, for two questions. WHOSE invitation it is: `accept_invitation_by_id` re-checks the
 * email match itself, so that check here is only the sentence. WHICH KIND it is: this filter
 * alone -- the function hands any kind on to 0007's `accept_invitation`. Accepted because the
 * worst a bypass does is accept a wedding invitation addressed to the caller's own address,
 * which that invitation's link already lets them do.
 */
export async function joinInvitationAction(invitationId: string): Promise<JoinOutcome> {
  if (!isUuid(invitationId)) return { ok: false, reason: 'unknown' }
  const session = await currentSession()
  if (!session) return { ok: false, reason: 'unknown' }

  const mine = await myPendingInvitations(getDb(), session.userId)
  if (!mine.some((i) => i.invitationId === invitationId && i.weddingId === null)) {
    return { ok: false, reason: 'unknown' }
  }

  const result = await acceptInvitationById(getDb(), invitationId, session.userId)
  if (result.outcome === 'accepted') {
    // Answered, not redirected: this is called directly rather than as a form action, and a
    // `redirect()` there rejects the client's promise -- which the screen would read as a
    // failure and announce before the navigation landed. The client navigates on `ok`.
    await actIn(result.orgId)
    return { ok: true }
  }
  switch (result.outcome) {
    case 'expired':
      return { ok: false, reason: 'expired' }
    case 'already_accepted':
      return { ok: false, reason: 'accepted' }
    default:
      return { ok: false, reason: 'unknown' }
  }
}
