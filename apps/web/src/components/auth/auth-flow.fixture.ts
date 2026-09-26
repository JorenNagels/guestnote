import type { AuthCopy } from './copy.ts'
import type { StageContent } from './stage.tsx'

/**
 * A complete `AuthCopy`, with strings chosen to be unmistakable in a failure message.
 *
 * Deliberately not the real Dutch catalogue. These tests are about which message is
 * SELECTED, and real copy makes that harder to see -- two error strings that both start
 * "Er ging iets mis" are indistinguishable in an assertion, and a catalogue edit would then
 * break tests that have nothing to do with the edit.
 *
 * The three templated strings keep their real `{placeholder}` tokens, because the
 * substitution is part of what is under test.
 */
export const COPY: AuthCopy = {
  language: 'Taal',
  steps: { public: 'STEP-PUBLIC', verifying: 'STEP-VERIFYING', private: 'STEP-PRIVATE' },
  signIn: {
    title: 'TITLE-SIGNIN',
    help: 'HELP-SIGNIN',
    emailLabel: 'LABEL-EMAIL',
    emailPlaceholder: 'PLACEHOLDER-EMAIL',
    continue: 'ACTION-CONTINUE',
    passkey: 'ACTION-PASSKEY',
    orContinue: 'DIVIDER-OR-CONTINUE',
    google: 'ACTION-GOOGLE',
  },
  verify: {
    title: 'TITLE-VERIFY',
    sentTo: 'SENT-BEFORE {email} SENT-AFTER',
    codeLabel: 'LABEL-CODE',
    submit: 'ACTION-SUBMIT',
    otherAddress: 'ACTION-OTHER-ADDRESS',
    resend: 'ACTION-RESEND',
    resendIn: 'RESEND-IN {seconds}',
  },
  arrive: { title: 'TITLE-ARRIVE', body: 'BODY-ARRIVE', continue: 'ACTION-ARRIVE-CONTINUE' },
  invite: {
    title: 'TITLE-INVITE',
    staff: '{inviter} / {org} / {role}',
    locked: 'NOTE-LOCKED',
    roleAdmin: 'ROLE-ADMIN',
    roleMember: 'ROLE-MEMBER',
  },
  enroll: {
    title: 'TITLE-ENROLL',
    body: 'BODY-ENROLL',
    confirm: 'ACTION-ENROLL-CONFIRM',
    dismiss: 'ACTION-ENROLL-DISMISS',
  },
  busy: { sending: 'BUSY-SENDING', checking: 'BUSY-CHECKING', enrolling: 'BUSY-ENROLLING' },
  noAccount: { prompt: 'NO-ACCOUNT-PROMPT', link: 'NO-ACCOUNT-LINK' },
  stage: {
    label: 'STAGE-LABEL',
    couple: 'STAGE-COUPLE',
    unit: 'STAGE-UNIT',
    attending: 'STAGE-ATTENDING',
    awaiting: 'STAGE-AWAITING',
    plusone: 'STAGE-PLUSONE',
    declined: 'STAGE-DECLINED',
    partial: 'STAGE-PARTIAL',
  },
  errors: {
    emailFormat: 'ERR-EMAIL-FORMAT',
    codeWrong: 'ERR-CODE-WRONG {attempts}',
    codeWrongOne: 'ERR-CODE-WRONG-ONE',
    codeSpent: 'ERR-CODE-SPENT',
    codeExpired: 'ERR-CODE-EXPIRED',
    rateLimited: 'ERR-RATE-LIMITED',
    deliveryFailed: 'ERR-DELIVERY-FAILED',
    unavailable: 'ERR-UNAVAILABLE',
    offline: 'ERR-OFFLINE',
    sessionExpired: 'ERR-SESSION-EXPIRED',
    passkeyGone: 'ERR-PASSKEY-GONE',
    inviteExpired: 'ERR-INVITE-EXPIRED {inviter}',
    inviteAccepted: 'ERR-INVITE-ACCEPTED',
    inviteCouple: 'ERR-INVITE-COUPLE',
    inviteUnknown: 'ERR-INVITE-UNKNOWN',
    inviteWrongAccount: 'ERR-INVITE-WRONG-ACCOUNT',
  },
}

export const STAGE: StageContent = {
  label: 'STAGE-LABEL',
  couple: 'STAGE-COUPLE',
  date: '12 september 2027',
  days: 214,
  unit: 'STAGE-UNIT',
  atoms: [{ key: 'attending', label: 'STAGE-ATTENDING' }],
}
