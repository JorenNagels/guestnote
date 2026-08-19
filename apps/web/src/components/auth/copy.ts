import { getTranslations } from 'next-intl/server'

/**
 * Every string the sign-in flow renders, resolved on the server and handed to the client
 * component as one plain object.
 *
 * ## Why not `useTranslations` in the client component
 *
 * Because that needs `NextIntlClientProvider`, and the provider ships a message catalogue
 * into the browser. This surface is the first thing an unauthenticated visitor downloads
 * on a phone with one bar of signal at a venue -- the scene the whole design is aimed at
 * -- and sending it the marketing namespace to render a login form is the wrong trade.
 *
 * The cost is this file. It is a real cost and it is paid on purpose: a key added here
 * and forgotten in a catalogue is a type error rather than a `auth.errors.thing` string
 * rendered to a planner.
 *
 * ## Templates
 *
 * Three messages carry a placeholder the client fills in, so they come through `t.raw`
 * un-interpolated and are substituted at the call site. Plurals are separate keys rather
 * than ICU, because the only plural here is "one attempt left" and a second catalogue
 * entry is cheaper to read than a plural rule.
 */
export type AuthCopy = Readonly<{
  language: string
  steps: Readonly<{ public: string; verifying: string; private: string }>
  signIn: Readonly<{
    title: string
    help: string
    emailLabel: string
    emailPlaceholder: string
    continue: string
    passkey: string
  }>
  verify: Readonly<{
    title: string
    /** template, `{email}` */
    sentTo: string
    codeLabel: string
    submit: string
    otherAddress: string
    resend: string
    /** template, `{seconds}` */
    resendIn: string
  }>
  arrive: Readonly<{ title: string; body: string; continue: string }>
  invite: Readonly<{
    title: string
    /** template, `{inviter}` `{org}` `{role}` */
    staff: string
    locked: string
    roleAdmin: string
    roleMember: string
  }>
  enroll: Readonly<{ title: string; body: string; confirm: string; dismiss: string }>
  busy: Readonly<{ sending: string; checking: string; enrolling: string }>
  /** The one line that answers the question an empty login page always raises. */
  noAccount: string
  stage: Readonly<{
    label: string
    couple: string
    unit: string
    attending: string
    awaiting: string
    plusone: string
    declined: string
    partial: string
  }>
  errors: Readonly<{
    emailFormat: string
    /** template, `{attempts}` */
    codeWrong: string
    codeWrongOne: string
    codeSpent: string
    codeExpired: string
    rateLimited: string
    deliveryFailed: string
    unavailable: string
    offline: string
    sessionExpired: string
    passkeyGone: string
    /** template, `{inviter}` */
    inviteExpired: string
    inviteAccepted: string
    inviteCouple: string
    inviteUnknown: string
  }>
}>

/**
 * Splits a template around one placeholder, so the value can be rendered as its own
 * element inside the sentence.
 *
 * Needed because "we sent a code to {email}." puts the address mid-sentence and the
 * address has to carry its own emphasis. Interpolating a string and appending the
 * emphasised part afterwards moves the full stop in front of it, in every language.
 */
export function splitAround(template: string, key: string): readonly [string, string] {
  const token = `{${key}}`
  const at = template.indexOf(token)
  return at === -1 ? [template, ''] : [template.slice(0, at), template.slice(at + token.length)]
}

/** Fills `{name}` placeholders. Deliberately dumb: no escaping, no nesting, no ICU. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  )
}

export async function getAuthCopy(): Promise<AuthCopy> {
  const t = await getTranslations('auth')
  const raw = (key: string) => t.raw(key) as string

  return {
    language: t('language'),
    steps: {
      public: t('steps.public'),
      verifying: t('steps.verifying'),
      private: t('steps.private'),
    },
    signIn: {
      title: t('signIn.title'),
      help: t('signIn.help'),
      emailLabel: t('signIn.emailLabel'),
      emailPlaceholder: t('signIn.emailPlaceholder'),
      continue: t('signIn.continue'),
      passkey: t('signIn.passkey'),
    },
    verify: {
      title: t('verify.title'),
      sentTo: raw('verify.sentTo'),
      codeLabel: t('verify.codeLabel'),
      submit: t('verify.submit'),
      otherAddress: t('verify.otherAddress'),
      resend: t('verify.resend'),
      resendIn: raw('verify.resendIn'),
    },
    arrive: {
      title: t('arrive.title'),
      body: t('arrive.body'),
      continue: t('arrive.continue'),
    },
    invite: {
      title: t('invite.title'),
      staff: raw('invite.staff'),
      locked: t('invite.locked'),
      roleAdmin: t('invite.roleAdmin'),
      roleMember: t('invite.roleMember'),
    },
    enroll: {
      title: t('enroll.title'),
      body: t('enroll.body'),
      confirm: t('enroll.confirm'),
      dismiss: t('enroll.dismiss'),
    },
    busy: {
      sending: t('busy.sending'),
      checking: t('busy.checking'),
      enrolling: t('busy.enrolling'),
    },
    noAccount: t('noAccount'),
    stage: {
      label: t('stage.label'),
      couple: t('stage.couple'),
      unit: t('stage.unit'),
      attending: t('stage.attending'),
      awaiting: t('stage.awaiting'),
      plusone: t('stage.plusone'),
      declined: t('stage.declined'),
      partial: t('stage.partial'),
    },
    errors: {
      emailFormat: t('errors.emailFormat'),
      codeWrong: raw('errors.codeWrong'),
      codeWrongOne: t('errors.codeWrongOne'),
      codeSpent: t('errors.codeSpent'),
      codeExpired: t('errors.codeExpired'),
      rateLimited: t('errors.rateLimited'),
      deliveryFailed: t('errors.deliveryFailed'),
      unavailable: t('errors.unavailable'),
      offline: t('errors.offline'),
      sessionExpired: t('errors.sessionExpired'),
      passkeyGone: t('errors.passkeyGone'),
      inviteExpired: raw('errors.inviteExpired'),
      inviteAccepted: t('errors.inviteAccepted'),
      inviteCouple: t('errors.inviteCouple'),
      inviteUnknown: t('errors.inviteUnknown'),
    },
  }
}
