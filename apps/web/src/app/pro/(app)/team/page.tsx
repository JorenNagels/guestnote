import { listPendingInvites, listTeam } from '@guestnote/db'
import { getTranslations } from 'next-intl/server'
import { InviteForm, type InviteFormCopy } from '../../../../components/team/invite-form.tsx'
import {
  PendingInvites,
  type PendingInvitesCopy,
  type PendingRow,
} from '../../../../components/team/pending-invites.tsx'
import {
  type TeamRow,
  TeamTable,
  type TeamTableCopy,
} from '../../../../components/team/team-table.tsx'
import { getDb } from '../../../../lib/db.ts'
import {
  currentMemberships,
  currentOrgId,
  currentOrgs,
  currentSession,
} from '../../../../lib/principal.ts'
import { inviteTeamMember, revokeInvite } from './actions.ts'

/**
 * The team screen. Owner and admin only: `listTeam` and `listPendingInvites` return `null`
 * for anyone else (`principalForOrg` is `null` for a `member`), and that is rendered as one
 * short notice rather than a 404, because a member has the link in their own sidebar.
 *
 * Authorization is those two repo calls plus RLS, not this file (invariant 7). The notice is
 * a courtesy for the person, not the gate.
 */
const DAY_MS = 24 * 60 * 60 * 1000

export default async function TeamPage() {
  const [memberships, orgId, orgs, session, t] = await Promise.all([
    currentMemberships(),
    currentOrgId(),
    currentOrgs(),
    currentSession(),
    getTranslations('app.s6'),
  ])
  const orgName = orgs.find((o) => o.id === orgId)?.name ?? ''

  const [team, pending] =
    memberships && orgId
      ? await Promise.all([
          listTeam(getDb(), memberships, orgId),
          listPendingInvites(getDb(), memberships, orgId),
        ])
      : [null, null]

  if (!team || !pending) {
    return (
      <Page title={t('title')} subtitle={orgName ? t('subtitle', { org: orgName }) : ''}>
        <section className="border-border bg-card max-w-xl rounded-[var(--radius)] border p-5">
          <h2 className="text-base font-semibold">{t('notAllowed.title')}</h2>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            {t('notAllowed.body', { org: orgName })}
          </p>
        </section>
      </Page>
    )
  }

  const tableCopy: TeamTableCopy = {
    caption: t('table.caption'),
    member: t('table.member'),
    role: t('table.role'),
    seat: t('table.seat'),
    weddings: t('table.weddings'),
    you: t('table.you'),
    noWeddings: t('table.noWeddings'),
  }
  const rows: TeamRow[] = team.map((m, i) => {
    const name = m.name?.trim() || m.email
    return {
      userId: m.userId,
      name,
      email: m.email,
      initials: initialsOf(name),
      roleLabel: t(`roles.${m.role}`),
      seatLabel: t('seat', { n: i + 1 }),
      weddings:
        m.role === 'member' ? m.weddings.map((w) => w.coupleDisplayName) : [t('table.allWeddings')],
      isYou: m.userId === session?.userId,
    }
  })

  const now = Date.now()
  const pendingRows: PendingRow[] = pending.map((p) => {
    const sent = Math.max(0, Math.floor((now - p.createdAt.getTime()) / DAY_MS))
    const left = Math.ceil((p.expiresAt.getTime() - now) / DAY_MS)
    const expired = p.expiresAt.getTime() <= now
    const sentLabel = sent === 0 ? t('pending.sentToday') : t('pending.sentAgo', { days: sent })
    const leftLabel = left <= 1 ? t('pending.expiresToday') : t('pending.expiresIn', { days: left })
    return {
      id: p.id,
      email: p.email,
      roleLabel: t(`roles.${p.role}`),
      statusLabel: `${sentLabel} · ${leftLabel}`,
      expired,
      revokeLabel: t('pending.revokeLabel', { email: p.email }),
    }
  })

  const inviteCopy: InviteFormCopy = {
    title: t('invite.title'),
    hint: t('invite.hint'),
    email: t('invite.email'),
    emailPlaceholder: t('invite.emailPlaceholder'),
    role: t('invite.role'),
    roleAdmin: t('roles.admin'),
    roleMember: t('roles.member'),
    roleAdminHint: t('invite.roleAdminHint'),
    roleMemberHint: t('invite.roleMemberHint'),
    send: t('invite.send'),
    sending: t('invite.sending'),
    // `{email}` is filled client-side, after the address is known.
    sent: t('invite.sent', { email: '{email}' }),
    errors: {
      invalidEmail: t('invite.errors.invalidEmail'),
      invalidRole: t('invite.errors.invalidRole'),
      duplicate: t('invite.errors.duplicate'),
      alreadyMember: t('invite.errors.alreadyMember'),
      forbidden: t('invite.errors.forbidden'),
      mailFailed: t('invite.errors.mailFailed'),
    },
  }
  const pendingCopy: PendingInvitesCopy = {
    caption: t('pending.caption'),
    email: t('pending.email'),
    role: t('pending.role'),
    status: t('pending.status'),
    revoke: t('pending.revoke'),
    revoking: t('pending.revoking'),
    revokeFailed: t('pending.revokeFailed'),
    expiredPill: t('pending.expired'),
  }

  return (
    <Page title={t('title')} subtitle={t('subtitle', { org: orgName })}>
      <div className="space-y-8">
        <TeamTable rows={rows} copy={tableCopy} />

        <InviteForm copy={inviteCopy} invite={inviteTeamMember} />

        <section aria-labelledby="s6-pending-title">
          <h2 id="s6-pending-title" className="text-base font-semibold">
            {t('pending.title')}
          </h2>
          {pendingRows.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">{t('pending.empty')}</p>
          ) : (
            <div className="mt-3">
              <PendingInvites rows={pendingRows} copy={pendingCopy} revoke={revokeInvite} />
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}

function Page({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p> : null}
      </header>
      <div className="mt-7">{children}</div>
    </div>
  )
}

/** First letters of the first and last word; one letter for a single word or an email. */
function initialsOf(name: string): string {
  if (name.includes('@')) return (name[0] ?? '?').toUpperCase()
  const words = name.split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? '?'
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}
