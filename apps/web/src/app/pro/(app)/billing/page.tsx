import type { BillingCycle } from '@guestnote/billing'
import {
  billingProfile,
  listPendingInvites,
  listTeam,
  principalForOrg,
  studioSettings,
} from '@guestnote/db'
import type { PillTone } from '@guestnote/ui/pill'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { BillingScreen } from '../../../../components/billing/billing-screen.tsx'
import { getBillingProvider } from '../../../../lib/billing.ts'
import { billingMode } from '../../../../lib/billing-mode.ts'
import { formatCivilDate } from '../../../../lib/civil-date.ts'
import { getDb } from '../../../../lib/db.ts'
import { DEFAULT_LOCALE, isLocale } from '../../../../lib/locales.ts'
import { moneyLocale } from '../../../../lib/money.ts'
import { currentCaller, currentSession } from '../../../../lib/principal.ts'
import { trialState } from '../../../../lib/trial.ts'
import { openPortalAction, saveInvoiceDetailsAction, startCheckoutAction } from './actions.ts'

/**
 * `/billing` -- spec 0005, "Billing". **A 404 while billing is off** (the demo: the route does
 * not exist, as the spec says) **and for a member** (the 404-not-403 rule `studio/page.tsx`
 * follows: a member has no Billing item, and nothing distinguishes a page you may not use from
 * one that does not exist). Owner and admin both use it -- the design's choice, which reverses
 * `research/07`'s owner-only.
 *
 * These checks are the courtesy; `actions.ts` asks both questions again for itself (invariant 7).
 *
 * The seat count is live: `org_members` rows via `listTeam`, owner included in the base, pending
 * invitations shown but not counted (spec 0005, "Seats").
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const mode = billingMode()
  if (!mode.on) notFound()
  const caller = await currentCaller()
  if (!caller || !principalForOrg(caller.memberships, caller.orgId)) notFound()

  const { memberships, orgId } = caller
  const [profile, team, pending, settings, session, rawLocale, t, params] = await Promise.all([
    billingProfile(getDb(), memberships, orgId),
    listTeam(getDb(), memberships, orgId),
    listPendingInvites(getDb(), memberships, orgId),
    studioSettings(getDb(), memberships, orgId),
    currentSession(),
    getLocale(),
    getTranslations('app.billing'),
    searchParams,
  ])
  if (!profile || !team || !settings) notFound()

  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const provider = getBillingProvider()
  const [invoices, subscription] = await Promise.all([
    provider.invoices(profile.billingCustomerId),
    provider.subscription(profile.billingSubscriptionId),
  ])

  const state = trialState(profile, mode, new Date())
  const paid = state.kind === 'paid'
  const cycle: BillingCycle = subscription?.cycle ?? profile.billingCycle ?? 'monthly'
  const date = (iso: string) => formatCivilDate(locale, iso)
  const status =
    state.kind === 'paid'
      ? subscription?.nextInvoiceOn
        ? t('status.paidNext', {
            cycle: t(`status.cycle.${cycle}`),
            date: date(subscription.nextInvoiceOn),
          })
        : t('status.paid', { cycle: t(`status.cycle.${cycle}`) })
      : state.kind === 'off'
        ? ''
        : // A cancelled plan also reads as `ended`, but its trial end may still be ahead, so
          // it gets a sentence without a date rather than "ended on" a day next week.
          profile.billingStatus === 'canceled'
          ? t('status.canceled')
          : t(`status.${state.kind}`, { date: date(state.endsOn) })
  const tone: PillTone =
    state.kind === 'paid'
      ? 'success'
      : state.kind === 'lastDays'
        ? 'warning'
        : state.kind === 'ended'
          ? 'danger'
          : 'neutral'
  const pillKey = state.kind === 'off' ? 'running' : state.kind

  // The provider sends the browser back with `?checkout=done` (`actions.ts`); the banner shows
  // only once the studio actually reads as paid, so a cancelled checkout does not thank anyone.
  const returned = params.checkout === 'done'
  const receiptTo = profile.billingEmail ?? session?.email ?? ''
  const success =
    returned && paid ? t('success', { studio: settings.name, email: receiptTo }) : null

  const owner = team.find((m) => m.role === 'owner') ?? team[0]
  const others = team.filter((m) => m !== owner)
  const extra = others.length
  const pendingCount = pending?.length ?? 0

  return (
    <BillingScreen
      tone={tone}
      paid={paid}
      seats={team.length}
      vatNumber={profile.vatNumber}
      cycle={cycle}
      moneyLocale={moneyLocale(locale)}
      details={{
        billingName: profile.billingName ?? '',
        billingEmail: profile.billingEmail ?? '',
        vatNumber: profile.vatNumber ?? '',
      }}
      invoices={invoices.map((i) => ({
        id: i.id,
        date: date(i.issuedOn),
        number: i.number,
        amount: new Intl.NumberFormat(moneyLocale(locale), {
          style: 'currency',
          currency: 'EUR',
        }).format(i.totalCents / 100),
        pdfUrl: i.pdfUrl,
      }))}
      actions={{
        checkout: startCheckoutAction,
        portal: openPortalAction,
        saveDetails: saveInvoiceDetailsAction,
      }}
      labels={{
        title: t('title'),
        status,
        success,
        plan: {
          title: t('plan.title'),
          pill: t(`plan.pill.${pillKey}`),
          cycleLabel: t('plan.cycle.label'),
          monthly: t('plan.cycle.monthly'),
          yearly: t('plan.cycle.yearly'),
          base: t('plan.base'),
          baseDetail: t('plan.baseDetail', { owner: owner?.name ?? owner?.email ?? '' }),
          extra: extra > 0 ? t('plan.extra', { count: extra }) : null,
          extraDetail: others.map((m) => m.name ?? m.email).join(', '),
          pending: pendingCount > 0 ? t('plan.pending', { count: pendingCount }) : null,
          perMonth: t('plan.perMonth'),
          perYear: t('plan.perYear'),
          total: t('plan.total'),
          vat: String(t.raw('plan.vat')),
          vatNone: t('plan.vatNone'),
          checkout: t('plan.checkout'),
          checkoutBusy: t('plan.checkoutBusy'),
          secure: t('plan.secure'),
          portal: t('plan.portal'),
          portalBusy: t('plan.portalBusy'),
          errors: {
            unavailable: t('plan.errors.unavailable'),
            failed: t('plan.errors.failed'),
            forbidden: t('plan.errors.forbidden'),
          },
        },
        details: {
          title: t('details.title'),
          name: t('details.name'),
          email: t('details.email'),
          vat: t('details.vat'),
          vatHelp: t('details.vatHelp'),
          save: t('details.save'),
          saving: t('details.saving'),
          saved: t('details.saved'),
          errors: {
            tooLong: t('details.errors.tooLong'),
            invalidEmail: t('details.errors.invalidEmail'),
            invalidVat: t('details.errors.invalidVat'),
            failed: t('details.errors.failed'),
          },
        },
        invoices: {
          title: t('invoices.title'),
          empty: t('invoices.empty'),
          date: t('invoices.date'),
          number: t('invoices.number'),
          amount: t('invoices.amount'),
          pdf: t('invoices.pdf'),
        },
        notes: {
          title: t('notes.title'),
          seats: t('notes.seats'),
          change: t('notes.change'),
          readOnly: t('notes.readOnly'),
        },
      }}
    />
  )
}
