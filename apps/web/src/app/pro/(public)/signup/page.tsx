import {
  billingProfile,
  listPendingInvites,
  listTemplates,
  listWeddings,
  type Memberships,
  myPendingInvitations,
  resolveMemberships,
  studioSettings,
} from '@guestnote/db'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { AuthFlow } from '@/components/auth/auth-flow.tsx'
import { fill, getAuthCopy } from '@/components/auth/copy.ts'
import { getStageContent } from '@/components/auth/stage-content.ts'
import { InvitedStep } from '@/components/signup/invited-step.tsx'
import { ReadyStep } from '@/components/signup/ready-step.tsx'
import { SignupFrame } from '@/components/signup/signup-frame.tsx'
import { StudioStep } from '@/components/signup/studio-step.tsx'
import { TeamStep } from '@/components/signup/team-step.tsx'
import { type PlanOption, WeddingStep } from '@/components/signup/wedding-step.tsx'
import { getAuth } from '../../../../lib/auth.ts'
import { billingMode } from '../../../../lib/billing-mode.ts'
import { getDb } from '../../../../lib/db.ts'
import { isLocale, LOCALES, type Locale } from '../../../../lib/locales.ts'
import { app } from '../../../../lib/routes.ts'
import { indicatorIndex, signupStep } from '../../../../lib/signup-step.ts'
import { starterTemplates } from '../../../../lib/starter-templates.ts'
import { brusselsToday, trialLastDay } from '../../../../lib/trial.ts'
import {
  confirmSignupLogo,
  createFirstWeddingAction,
  createStudioAction,
  inviteTeamAction,
  joinInvitationAction,
  startSignupLogoUpload,
} from './actions.ts'

/**
 * `app.guestnote.be/signup` -- a planner starts their own studio (spec 0005, Sign-up).
 *
 * One route for every step, and the server decides which one to render from the session and the
 * database (`lib/signup-step.ts` argues why). With no session it is `AuthFlow` -- the sign-in
 * flow itself, pointed back here -- so Account and Verify are exactly the screens a returning
 * planner already knows. With a session, the memberships are resolved fresh
 * (`resolveMemberships`), not through the request cache, for the reason `actions.ts` gives.
 *
 * ## Unlike `/login`, a session does not send you away
 *
 * `/login` redirects a signed-in visitor because it owns no multi-step ceremony that a
 * re-render could interrupt (its docblock has the eleven days that cost). This page is the
 * opposite case: a session is how you reach every step after Verify. What it must not do is
 * host a ceremony that survives a re-render, and it does not -- the steps are forms that post
 * and navigate, and the passkey offer lives on the shell (`enrollment-prompt.tsx`), where the
 * planner arrives after "Open Guestnote".
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const billing = billingMode()
  const [session, query, rawLocale, copy, t, studioT] = await Promise.all([
    getAuth().getSession(await headers()),
    searchParams,
    getLocale(),
    getAuthCopy(billing.on),
    getTranslations('app.signup'),
    // The logo block's copy is the Studio page's (`app.studio.logo`), not a second copy of it.
    getTranslations('app.studio'),
  ])
  const locale: Locale = isLocale(rawLocale) ? rawLocale : LOCALES[0]
  const stage = await getStageContent(copy)
  const labels = [t('steps.account'), t('steps.studio'), t('steps.wedding'), t('steps.team')]
  const signupFooter = (
    <>
      {t('account.notPlanner')} {t('account.haveAccount')}{' '}
      <a
        href={app.login()}
        className="font-medium text-foreground underline underline-offset-[3px]"
      >
        {t('account.signIn')}
      </a>
    </>
  )

  if (!session) {
    return (
      <AuthFlow
        copy={copy}
        locale={locale}
        locales={LOCALES}
        passkeysEnabled={getAuth().passkeysAvailable()}
        googleEnabled={getAuth().googleAvailable()}
        googleReturn="signup"
        continueHref={app.signup()}
        stage={stage}
        heading={t('account.title')}
        lead={billing.on ? t('account.introBilling') : t('account.introDemo')}
        steps={{ labels, current: 0 }}
        footer={signupFooter}
      />
    )
  }

  const db = getDb()
  const memberships = await resolveMemberships(db, session.userId)
  const ownedOrgId = memberships.orgs.find((o) => o.role === 'owner')?.orgId ?? null
  const own = query.own === '1'
  // Looked up only when the answer can change the step: an owner never sees the list, and
  // neither does someone who already chose their own studio.
  const invitations = ownedOrgId || own ? [] : await myPendingInvitations(db, session.userId)
  const step = signupStep({
    signedIn: true,
    ownsStudio: ownedOrgId !== null,
    pendingInvitations: invitations.length,
    own,
    step: typeof query.step === 'string' ? query.step : undefined,
  })
  if (step === 'home') redirect(app.home())
  // Unreachable with a session -- `signupStep` answers `account` only without one -- and
  // stated so the rest of this function is typed for the steps it renders.
  if (step === 'account') redirect(app.signup())

  const frame = {
    steps: labels,
    current: indicatorIndex(step),
    language: copy.language,
    locale,
    locales: LOCALES,
    stage,
  }

  switch (step) {
    case 'invited':
      return (
        <SignupFrame {...frame} footer={signupFooter}>
          <InvitedStep
            labels={{
              title: t('invited.title'),
              intro: t.raw('invited.intro') as string,
              staffLine: t.raw('invited.staffLine') as string,
              weddingLine: t.raw('invited.weddingLine') as string,
              invitedBy: t.raw('invited.invitedBy') as string,
              roleAdmin: t('invited.roleAdmin'),
              roleMember: t('invited.roleMember'),
              join: t('invited.join'),
              joining: t('invited.joining'),
              open: t('invited.open'),
              couplePortal: t('invited.couplePortal'),
              ownStudio: t('invited.ownStudio'),
              errors: {
                expired: t('invited.errors.expired'),
                accepted: t('invited.errors.accepted'),
                unknown: t('invited.errors.unknown'),
              },
            }}
            email={session.email}
            invitations={invitations.map((i) => ({
              id: i.invitationId,
              orgName: i.orgName,
              weddingName: i.weddingName,
              isWedding: i.weddingId !== null,
              role: i.role,
              inviterName: i.inviterName,
            }))}
            ownStudioHref={app.signupOwnStudio()}
            homeHref={app.home()}
            join={joinInvitationAction}
          />
        </SignupFrame>
      )
    case 'studio':
      return (
        <SignupFrame {...frame}>
          <StudioStep
            labels={{
              title: t('studio.title'),
              intro: t('studio.intro'),
              nameLabel: t('studio.nameLabel'),
              namePlaceholder: t('studio.namePlaceholder'),
              ownerLabel: t('studio.ownerLabel'),
              ownerPlaceholder: t('studio.ownerPlaceholder'),
              preview: t('studio.preview'),
              previewFallback: t('studio.previewFallback'),
              create: t('studio.create'),
              creating: t('studio.creating'),
              continue: t('studio.continue'),
              logo: {
                label: studioT('logo.label'),
                upload: studioT('logo.upload'),
                replace: studioT('logo.replace'),
                remove: studioT('logo.remove'),
                uploading: studioT('logo.uploading'),
                removing: studioT('logo.removing'),
                help: studioT('logo.help'),
                added: studioT('logo.added'),
                removed: studioT('logo.removed'),
                errors: {
                  notImage: studioT('logo.errors.notImage'),
                  tooLarge: studioT('logo.errors.tooLarge'),
                  failed: studioT('logo.errors.failed'),
                },
                afterCreate: studioT('logo.errors.afterCreate'),
              },
              errors: {
                required: t('studio.errors.required'),
                tooLong: t('studio.errors.tooLong'),
                failed: t('studio.errors.failed'),
                forbidden: t('studio.errors.forbidden'),
              },
            }}
            ownerName={session.name ?? ''}
            action={createStudioAction}
            logoActions={{ start: startSignupLogoUpload, confirm: confirmSignupLogo }}
          />
        </SignupFrame>
      )
  }

  // The three optional steps all act in the studio this user owns; `signupStep` returns them
  // only when there is one.
  const orgId = ownedOrgId as string

  switch (step) {
    case 'wedding':
      return (
        <SignupFrame {...frame}>
          <WeddingStep
            labels={{
              title: t('wedding.title'),
              intro: t('wedding.intro'),
              coupleLabel: t('wedding.coupleLabel'),
              couplePlaceholder: t('wedding.couplePlaceholder'),
              dateLabel: t('wedding.dateLabel'),
              planLabel: t('wedding.planLabel'),
              tasks: t.raw('wedding.tasks') as string,
              empty: t('wedding.empty'),
              emptyHint: t('wedding.emptyHint'),
              create: t('wedding.create'),
              creating: t('wedding.creating'),
              skip: t('wedding.skip'),
              errors: {
                required: t('wedding.errors.required'),
                tooLong: t('wedding.errors.tooLong'),
                invalidDate: t('wedding.errors.invalidDate'),
                failed: t('wedding.errors.failed'),
                forbidden: t('wedding.errors.forbidden'),
              },
            }}
            plans={await planOptions(memberships, orgId, locale)}
            skipHref={app.signupStep('team')}
            action={createFirstWeddingAction}
          />
        </SignupFrame>
      )
    case 'team':
      return (
        <SignupFrame {...frame}>
          <TeamStep
            labels={{
              title: t('team.title'),
              intro: t('team.intro'),
              emailLabel: t.raw('team.emailLabel') as string,
              emailPlaceholder: t('team.emailPlaceholder'),
              note: billing.on ? t('team.noteBilling') : t('team.noteDemo'),
              sendNone: t('team.sendNone'),
              sendOne: t('team.sendOne'),
              sendMany: t.raw('team.sendMany') as string,
              sending: t('team.sending'),
              sent: t('team.sent'),
              skip: t('team.skip'),
              errors: {
                invalidEmail: t('team.errors.invalidEmail'),
                invalidRole: t('team.errors.invalidRole'),
                duplicate: t('team.errors.duplicate'),
                alreadyMember: t('team.errors.alreadyMember'),
                forbidden: t('team.errors.forbidden'),
                mailFailed: t('team.errors.mailFailed'),
              },
            }}
            skipHref={app.signupStep('ready')}
            action={inviteTeamAction}
          />
        </SignupFrame>
      )
    case 'ready': {
      const [settings, weddings, invites, profile] = await Promise.all([
        studioSettings(db, memberships, orgId),
        listWeddings(db, memberships, orgId),
        listPendingInvites(db, memberships, orgId),
        billing.on ? billingProfile(db, memberships, orgId) : null,
      ])
      const now = Date.now()
      const invited = (invites ?? []).filter((i) => i.expiresAt.getTime() > now).length
      const studioName = settings?.name ?? ''
      // From the studio's own row, not from today, so a Ready opened again later -- it stays
      // addressable -- says what the reminder cron will compute: the hand-set override if
      // there is one, else creation (or billing's start) plus a month.
      const trialEnd =
        billing.on && profile
          ? profile.trialEndsAt
            ? brusselsToday(profile.trialEndsAt)
            : trialLastDay(brusselsToday(profile.createdAt), billing.from)
          : null
      const trial = trialEnd
        ? fill(t.raw('ready.trial') as string, {
            date: new Intl.DateTimeFormat(locale, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            }).format(new Date(`${trialEnd}T00:00:00Z`)),
          })
        : undefined
      return (
        <SignupFrame {...frame}>
          <ReadyStep
            labels={{
              title: fill(t.raw('ready.title') as string, { studio: studioName }),
              studio: t('ready.studio'),
              wedding: t('ready.wedding'),
              team: t('ready.team'),
              teamValue:
                invited === 0
                  ? t('ready.teamNone')
                  : fill(t.raw('ready.teamInvited') as string, { count: invited }),
              ...(trial ? { trial } : {}),
              open: t('ready.open'),
            }}
            studioName={studioName}
            weddingName={weddings[0]?.coupleDisplayName ?? null}
            homeHref={app.home()}
          />
        </SignupFrame>
      )
    }
  }
}

/**
 * The studio's templates for the starting-plan picker, the starters first and in their own
 * order -- `listTemplates` is alphabetical, which would put "Dagcoördinatie" before the full
 * plan the spec makes the default.
 */
async function planOptions(m: Memberships, orgId: string, locale: Locale): Promise<PlanOption[]> {
  const listed = await listTemplates(getDb(), m, orgId)
  const order = starterTemplates(locale).map((s) => s.name)
  const rank = (name: string) => {
    const i = order.indexOf(name)
    return i === -1 ? order.length : i
  }
  return (listed?.templates ?? [])
    .filter((tpl) => tpl.itemCount > 0)
    .sort((a, b) => rank(a.name) - rank(b.name))
    .map((tpl) => ({ id: tpl.id, name: tpl.name, itemCount: tpl.itemCount }))
}
