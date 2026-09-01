# Spec 0002 — Signing in with a passkey

**Date:** 2026-08-30 · **Status:** Built 2026-08-30 – 2026-09-01, amended twice · **Last
amended:** 2026-09-01
**Phase:** W3, completing the sign-in ladder · **Bar:** a planner opens the dashboard with a
face or a fingerprint and no email at all

A returning planner's passkey is offered inside the browser's own autofill sheet on the
sign-in field, and using it lands them in the dashboard without an email ever being sent.
Enrollment already works; this is the other half of the ceremony, and it replaces the
"find the code in your inbox" detour that is the slowest thing about signing in today.

## Already settled elsewhere

Everything in this table was decided before this spec and is not reopened by it.

| Decision | Where it was already made |
|---|---|
| Passkey primary, email code the fallback and the only recovery. No password, no magic link | `.impeccable/surfaces/src-app-pro-public-login.md:13`, `research/07-auth-and-tenancy.md` |
| The affordance is the field, not a button: `autocomplete="username webauthn"` (webauthn last), conditional mediation preloaded on mount | brief `:306-308`; `auth-flow.tsx:603`; attribute order pinned by `auth-flow.test.tsx:200` |
| No method menu — a primary-weight "sign in with a passkey" button is forbidden; the explicit control is secondary weight and only where conditional UI is absent | brief `:310-311`; asserted `auth-flow.test.tsx:781` |
| Passkey failures render as **nothing** — no red, no message, no live-region announcement | `passkey.ts:60-75` (`SilentPasskeyOutcome`), brief `:232-237` |
| The passkey path skips rung 1 and lands on rung 2; rung 2 self-redirects after `DESCENT_MS` | brief `:118-128`; `auth-flow.tsx:523-532` |
| `rpID` is `app.<rootDomain>`, never the apex, and is permanent from the first passkey | `apps/web/src/lib/auth.ts`, `better-auth.ts:49-58` |
| A staging passkey is structurally unusable on production — `rpID` differs (`app.staging.guestnote.be`), and `rp.id` is hashed into the authenticator | `sst.config.ts` root domain per stage; nothing to build |
| `origin` is `baseURL`, port included in dev | `lib/auth.ts`'s `origin()` |
| The seam is the only Better Auth importer; app code may not reach `@better-auth/passkey/client` | invariant 5. **Corrected 2026-08-31:** when this row was written, neither mechanism actually covered it — `biome.json` restricted the bare path `better-auth`, and the grep in `no-unsafe-imports.test.ts` could not match a leading `@`. Both were widened in this change to cover `@better-auth/*` and `@simplewebauthn/*`, so the row is now true rather than aspirational |
| `passkeys` is in `UNSCOPED_TABLES` with no RLS, by design — looked up by credential id before a principal exists | `packages/db/src/schema/index.ts`, `schema/auth.ts` |
| The table already has `counter`, unique `credential_id`, `user_id` index | `schema/auth.ts` |
| Passkey *management* (list, rename, revoke) belongs to account settings, not the door | brief `:205` |
| Cross-device (QR) is in scope only as "do not suppress it" — the platform draws the QR | brief `:68`, `:235` |

**No migration.** This spec touches no schema.

## Decisions taken here

### The server ceremony is the library's, entire

**Two new seam methods wrapping `auth.api.generatePasskeyAuthenticationOptions` and
`auth.api.verifyPasskeyAuthentication`, and nothing else.** The installed
`@better-auth/passkey` 1.7.1 verifies the assertion against a challenge it put in a signed
cookie, checks origin and RP ID hash, updates `counter`, **and mints the session cookie
itself** via `setSessionCookie`. `nextCookies()` is already last in the plugin chain, so a
Server Function's response carries it.

Rejected: hand-rolling verification, or having the app POST `/passkey/*` directly.
`types.ts's header` already argues the second one down — a Better Auth *route path* in app code
is precisely what a provider swap would have to hunt for.

### Sign-in is usernameless, and the typed email is never sent

**No user id, no email, no `allowCredentials` on the sign-in path.** The plugin only sets
`allowCredentials` when a session already exists, so an unauthenticated assertion is always
against a discoverable credential. The address in the field is not read by this path.

This is also the rule `actions.ts's enrollment note` states for enrollment, extended: **neither new
Server Function takes an argument through which a caller could name an account.**

### `residentKey: 'required'` on enrollment

**Enrollment changes from the plugin's `preferred` to `required`** (with
`requireResidentKey: true`), so every passkey Guestnote mints is guaranteed to be
discoverable and therefore signable.

Rejected: leaving it `preferred`. Under `preferred` an enrollment can succeed and produce a
credential the usernameless sign-in path can never offer — a failure invisible to both the
visitor and to us, surfacing only as an autofill sheet that lists nothing.

Cost accepted: an authenticator without resident-key storage now refuses to enroll. Narrow,
because the offer is already gated on `platformAuthenticatorAvailable()` and Touch ID,
Face ID and Windows Hello all store discoverable credentials. Existing staging passkeys
enrolled under `preferred` are unaffected either way — this changes what is created, not
what is accepted.

### User verification stays at the plugin's default

**`userVerification: 'preferred'` and `requireUserVerification: false` are accepted as they
are.** An assertion whose authenticator did not check a face, fingerprint or PIN still
yields a session.

Rejected: enforcing UV in an `authentication.afterVerification` hook. It closes a narrow gap
— in practice every platform authenticator we offer to performs UV — at the price of the
seam reaching into a plugin hook, one more thing to re-derive on every Better Auth upgrade,
and turning a legitimate non-UV authenticator into an unexplainable silent failure.

Cost accepted, stated plainly: this is the one place the ceremony trusts the authenticator's
own judgement. Brief §7.5 listed it unratified; it is ratified here as "default", not as
"unconsidered".

### One failure escapes the silence: an unknown credential

**`PASSKEY_NOT_FOUND` renders `errors.passkeyGone`. Every other failure renders nothing.**

The copy already ships in all three locales and has since the brief's state 5:

- nl — "Deze passkey werkt niet meer voor dit account. Ga verder met een code."
- fr — "Cette passkey ne fonctionne plus pour ce compte. Continuez avec un code."
- en — "This passkey no longer works for this account. Continue with a code."

Rejected: silence for everything, keeping `SilentPasskeyOutcome` as the entire vocabulary.
It is the simpler posture and it produces a dead end — someone whose passkey was revoked
gets an OS sheet that does nothing and no reason, which is exactly what state 5 was written
to prevent. A deleted credential is not a secret from the person holding it.

Cost accepted: **one bit** crosses the boundary that `actions.ts` currently keeps closed.
The sign-in Server Function returns `{ ok: true } | { ok: false; gone: boolean }` — `gone`
is true only for `PASSKEY_NOT_FOUND`. A counter regression, a cancelled sheet and a generic
verification failure all arrive as `gone: false` and are indistinguishable client-side, so
the dangerous distinction stays unrepresentable rather than merely unrendered.

### A counter regression is logged, and only logged

**A structured `console.warn` from the seam, naming the credential id. Nothing on screen,
nothing in the live region.** Brief `:237` requires refuse-fall-back-and-log, and this is
the only sink that exists: it reaches CloudWatch on staging and the terminal locally.

**Amended 2026-08-30, during the build.** This section originally said the log would name a
counter regression as such. It cannot. SimpleWebAuthn throws on a counter regression, the
plugin catches it, logs the discriminating message through *its own* logger, and rethrows a
flat `AUTHENTICATION_FAILED` (`@better-auth/passkey/dist/index.mjs:512-516`) — so by the
time the seam sees it, a cloned authenticator and a corrupt signature are the same error.
The `authentication.afterVerification` hook does not help: it runs only on success.

What ships instead is deliberately **wider** than the brief asked: every failed assertion is
logged with the credential id it was for, and `passkey_unknown` is excluded because a
credential we never stored is an ordinary revocation rather than a signal about an
authenticator we know. A counter regression is a subset of that line; Better Auth's own
logger carries the sentence that distinguishes it. The alternative — matching on the error
message string to narrow it — was rejected as a silent breakage on any upstream copy edit.

Rejected: an audit table. It is the right answer eventually and it costs a new table, a
tenancy classification, an RLS decision and a migration — none of which this feature
otherwise needs, and all of which would make this diff something other than a sign-in
feature. Also rejected: logging nothing, which leaves the only signal that an authenticator
may have been cloned going nowhere.

Cost accepted: not queryable, not alertable, and it will be the only line in the auth seam
that logs — so it carries a comment saying why, and `Still open` names the sink it wants.

### Conditional mediation starts on mount, and `AuthFlow` owns the abort

**An `AbortController` held by the flow.** The conditional `navigator.credentials.get()`
starts in an effect on mount and is aborted on unmount **and when the visitor submits the
email form instead** — an outstanding conditional request left running while rung 1 renders
is a promise that can resolve onto a screen that no longer exists.

Rejected: firing the ceremony only from the explicit control. No open promise to manage, and
on Chrome and Safari — most planners — the passkey would then never be offered at all. That
is the method menu the brief refuses, inverted.

### Enrollment no longer pins `authenticatorAttachment`

**Amended 2026-08-31.** Enrollment passed `authenticatorAttachment: 'platform'` from the
commit that shipped it (`12c5ae3`, 2026-08-19) until today, so that the OS sheet matched the
copy's promise of a face or a fingerprint on *this* device rather than also offering a
security key or a phone by QR.

**Enrollment never once succeeded in that window** — `passkeys` empty on all three Neon
branches for eleven days, with the ceremony never returning at all rather than failing, so
nothing threw and nothing could be reported. The pin's introduction is an exact match for the
start of the failure window. The working theory is that a password-manager extension patches
`navigator.credentials.create` before the browser evaluates these options, and a request
pinned to a device-bound authenticator is one it neither handles nor cleanly declines.

Unpinning is also the better product decision on its own merits, and that is the part worth
keeping even if the theory is wrong. A synced credential is worth more than a device-bound one
to a planner moving between a laptop, a phone and a venue iPad, and password managers are how
most people will actually keep a passkey. Refusing them to keep one sentence of copy literally
true is the wrong trade.

**Consequence for the copy, still owed:** `auth.enroll.body` promises "je gezicht of
vingerafdruk" in three locales, and the sheet may now also offer a security key or a phone.
The copy should widen; it has not yet.

Rejected: keeping the pin and telling planners to use Touch ID. That is the trade this whole
amendment exists to undo.

### Cross-device is honoured by not filtering

**The sign-in `get()` passes no `authenticatorAttachment` and restricts no transports**, so
the platform is free to draw its QR and run the hybrid transport. This is the whole of
brief `:68`'s "we must simply not suppress it".

Note the asymmetry, because it looks like an inconsistency and is not: *enrollment* pins
`authenticatorAttachment: 'platform'` on purpose (`better-auth.ts`'s note — the copy
promises a face or a fingerprint on *this* device). Sign-in makes no such promise and so
imposes no such filter.

### No passkey on an invitation landing

**When `boundEmail` is set, both the conditional request and the explicit control are
suppressed.** An invitation exists to fix *which* address signs in; a discoverable-credential
assertion ignores the pinned address entirely, so a visitor with another account's passkey
could land in that account with the invitation still unclaimed and no indication of it.

Same argument that already hides the Google button on that screen (`auth-flow.tsx`'s Google branch).

Cost accepted: an invited planner who already has a passkey types a code once.

### No name step on the passkey path

**`needsName` is not returned by the passkey ceremony and rung 2 does not ask.** A passkey
can only exist on an account that already completed an email-code sign-in, so the name
question was already put once. Rejected: parity with `verifyEmailCode`, which would grow an
interruption on the fast path for a case that should not occur.

Cost accepted: an account that declined the name question stays nameless via this path
forever.

### Rung 2 does not offer enrollment after a passkey sign-in

**The flow carries which rung-0 path was taken into rung 2 and suppresses the offer when it
was the passkey.** Brief `:273` (state 27) says never offer where one is already enrolled;
this covers it without a round-trip.

Rejected: asking the server whether the user holds any passkey. It covers state 27 fully —
including "signed in with a code on a device that already has a passkey" — at the price of a
new seam method, a round-trip on every sign-in, and leaking "this account has a passkey" to
anyone who reaches rung 2. The uncovered case stays uncovered and is named in `Still open`.

> **Amended 2026-09-01 — the rejected option was taken, and the objection to it dissolved
> rather than being overruled.**
>
> The enrollment offer moved off rung 2 onto the shell (`components/auth/enrollment-prompt.tsx`),
> which is where `auth-flow.tsx` had said it belonged since it was written, and which is what
> let `login/page.tsx` have its redirect back — see the amendment below. Once the offer lives
> behind a session, `hasPasskey()` on the seam is a read the account's own owner performs
> about themselves, so the disclosure objection does not apply: there is nobody on that side
> of the wall to leak to. The round trip is real and is paid concurrently with four reads the
> dashboard layout already makes, and it stops for good the moment the user enrols.
>
> So **state 27 is now fully covered in the direction that matters** — a code sign-in on a
> device that already holds a passkey no longer gets an offer. The cross-device over-reach in
> `SignedInWith` remains, and remains accepted: a QR sign-in proves a passkey exists on a
> phone, not on the laptop in front of the visitor, and reading the assertion's
> `authenticatorAttachment` would mean trusting a client-supplied value to decide what to
> show. `Still open` item 1 is closed; that residue is now item 1a.

### The enrollment offer lives on the shell, not on rung 2

**Amended 2026-09-01.** This spec built the offer on rung 2 because there was no shell to
host it. There is one, and the placement was costing more than convenience:

- The login page's `if (session) redirect(home)` guard made enrollment **structurally
  impossible** — asking for a challenge sets a cookie, `cookies().set()` re-renders the route,
  and the re-render hit the guard with the OS sheet still open. Eleven days, 2026-08-19 to
  2026-08-31, with `passkeys` empty on all three Neon branches. The guard was deleted to
  unblock the feature; with the ceremony off this surface it is back, and the rule the page
  now encodes is not "redirect signed-in visitors" but **"this page must own no multi-step
  ceremony"**.
- `PasskeyRequestOptions`' promise that `allowCredentials` is always absent depended on that
  redirect and was false for the day it was gone.

The offer is gated on a `?welcome=passkey` marker the sign-in flow puts on `continueHref`,
**not** on "this user has no passkey" alone. `createPasskeyChallenge` sits behind the
plugin's `freshSessionMiddleware`, so a standing nag would work on day one and fail silently
from day two — and every passkey failure here renders as nothing, so nobody would see it.
The same constraint applies to a future "add a passkey" button in account settings: that call
site needs a re-authentication step, not a wider middleware.

## Behaviour

### Rung 0, conditional path (the intended one)

1. On mount, if `passkeysEnabled && conditionalAvailable && !boundEmail`, the flow starts a
   conditional `get()`.
2. Nothing is drawn. The browser attaches the credential to its own autofill sheet on the
   email field. **We contribute no prompt, no button and no copy** (brief `:232`).
3. On an assertion: the flow moves **straight to rung 2**, skipping rung 1, and rung 2
   self-redirects to `continueHref` after `DESCENT_MS` with no enrollment offer.
4. On any failure: nothing renders, the flow stays on rung 0, the email path is untouched
   — except an unknown credential, below.
5. If the visitor submits the email form first, the controller aborts and the flow proceeds
   to rung 1 exactly as it does today.

### Rung 0, explicit control

Only when `passkeysEnabled && platformAvailable && !conditionalAvailable && !boundEmail` —
that is `showPasskeyControl` as it already stands, plus the `boundEmail` term. The existing
secondary-weight button (`auth-flow.tsx:627-637`) gets its handler: a
modal `get()`, `busy.checking` while it is outstanding, then the same rung-2 landing.

`busy.checking` doing double duty is deliberate — it also satisfies brief `:235`'s "our
screen states only that it is waiting" for the cross-device case, without new copy.

### States

| State | What renders |
|---|---|
| Offered (conditional fires) | nothing from us; the OS owns the sheet |
| Cancelled / dismissed sheet | nothing |
| Unsupported (no platform authenticator, or no conditional UI) | nothing; the email path is the whole screen |
| Cross-device | the platform draws the QR; the explicit control shows `busy.checking` |
| **Unknown credential** | `errors.passkeyGone` as an `InlineError`, the email field still focusable and usable |
| Counter regression | nothing on screen; one `console.warn` server-side |
| Offline | **nothing.** `runPasskeySignIn` catches both round trips into `'silent'`, so an unreachable server during a passkey ceremony renders exactly like a dismissed sheet. This row originally promised `errors.offline`; the code is right and the spec was wrong (corrected 2026-08-31). `errors.offline` still belongs to the *email* path, where the visitor pressed a button and is owed an answer |
| Invitation landing | no passkey affordance at all |
| Rung 2 after a passkey | no enrollment offer; redirect after `DESCENT_MS` |

## Data

**None.** No new table, no new column, no migration. `passkeys.counter` is written by the
plugin's existing verification path.

## Permissions

Not applicable: this is the unauthenticated door. The assertion *is* the authorization, and
`passkeys` carries no RLS by design (`schema/index.ts:81`) because the lookup happens by
credential id before any principal exists.

## Copy

**No new strings.** Every string this feature renders already ships in nl, fr and en:

| Key | Used for |
|---|---|
| `auth.signIn.passkey` | the explicit control — "Gebruik je passkey" / "Utiliser votre passkey" / "Use your passkey" |
| `auth.busy.checking` | the explicit control while the ceremony is outstanding |
| `auth.errors.passkeyGone` | the unknown-credential state, and the only sentence this feature can produce |
| `auth.errors.offline` | the email path only — **not** the passkey ceremony, which is silent when the server is unreachable |

That no key is added is itself a check on the design: the brief's position is that a correct
passkey sign-in has almost nothing to say.

## Not in scope

| Not building now | Why, or which phase |
|---|---|
| Passkey management — list, rename, revoke | Account settings, not the door. Brief `:205`. Needs the re-auth step `createPasskeyChallenge`'s comment already flags |
| The rate-limiter gap | Its own change — see below. Naming it here stops it drifting back in |
| An audit sink for counter regressions | Wants a table and a migration; `console.warn` holds the line until then |
| Enforcing user verification | Decided above as "plugin default". Reopen with a measurement, not a preference |
| Enrollment changes beyond `residentKey` | Rung 2's offer, its copy and its placement stay exactly as they are |
| A "signed in with a passkey" confirmation | Rung 2 is a transition, not a destination |

### The rate-limiter gap, recorded because it was found here

`auth.api.*` called from a Server Function runs outside Better Auth's router, so it
**bypasses the rate limiter entirely** — the limiter lives in `router().onRequest` and only
sees `/api/auth/*`. The seam's own `rateLimit` comment (the seam's `rateLimit` note) describes
protection this app's Server Function paths do not actually get.

This is not a passkey problem. The **email-code** Server Function has the same gap, and each
unmetered request there is a real SES send against a 200/day sandbox ceiling — the more
expensive of the two holes by a distance. `advanced.ipAddress.trustedProxies` is also still
unset, so behind CloudFront every request keys to one bucket and the `rate_limits` table is
decorative.

Fixing it belongs to its own change covering both paths, and it needs the `AUTH_POLICY`
thresholds decided — they are still explicitly placeholders
(`packages/core/src/auth/policy.ts`). Until then the exposure is: staging, invite-only, no
production deployment.

**`reportCeremonyFailure` is a third path and this note does not cover it** — added
2026-09-01 after `tenancy-auditor` pointed out that `actions.ts` claimed it did. It is not an
`auth.api.*` call, so a limiter added to the two paths above would not reach it unless
someone remembers to include it. **Include it.** It is unauthenticated, takes
attacker-controlled strings, and every call is one Sentry event against a 5,000/month tier
metered per event rather than per issue — an unbounded loop disables the observability this
whole feature was instrumented to provide. Mitigated in the meantime by a per-process cap of
50 vendor events (`CEREMONY_REPORT_BUDGET`); the CloudWatch sink is deliberately left
uncapped, because it is the one that still works when Sentry does not.

**One thing this feature changes about the gap, added 2026-08-31 after review.**
`beginPasskeySignIn` is the first of these Server Functions that runs **without anyone
pressing anything** — on mount, for every visitor whose browser does conditional mediation.
So the unmetered baseline stops being "a deliberate act somebody performed" and becomes
ordinary login-page traffic, one `verifications` row per view, on a table nothing prunes
until M10. That does not change the decision to defer — `requestCode` is still strictly more
expensive per call, because it sends mail — but it does mean the limiter must close before a
`v*` tag rather than merely before general availability.

## Done means

- [x] Two seam methods on `better-auth.ts`, returning plain data; no Better Auth type crosses
- [x] Two Server Functions in `actions.ts`, neither taking a user id or an email
- [x] `signInWithPasskey()` in `passkey.ts`, hand-rolled base64url both ways, options spread
      through with only the encoded fields replaced — **not** `parseRequestOptionsFromJSON`
- [x] `residentKey: 'required'` on enrollment, with the comment saying what it rejected
- [x] `AuthFlow` owns an `AbortController`; aborts on unmount and on email submit
- [x] `boundEmail` suppresses both affordances
- [x] Rung 2 suppresses the enrollment offer after a passkey sign-in
- [x] `errors.passkeyGone` renders for `PASSKEY_NOT_FOUND` and for nothing else
- [x] `console.warn` on a counter regression; nothing on screen, nothing announced
- [x] Tests: the ceremony helpers with no DOM (`.ts`), the flow states in `auth-flow.test.tsx`
      (`.tsx`), fixtures local to `auth-flow.test.tsx` (`REQUEST_OPTIONS`, `ASSERTION`) —
      `auth-flow.fixture.ts` needed no change, its `COPY` already carried `signIn.passkey`
      and `busy.checking`
- [x] **Every new assertion proven by mutation** — break the code, watch it fail. Where one
      cannot discriminate, the note goes beside the assertion, not in the source
- [x] `npm run check` green. Ask `/verify` which further rungs this needs — no schema change,
      so the database tiers are probably not among them, and that is a question for the skill
      rather than an assumption here

## Still open

1. ~~**State 27 is only partly covered.** Signing in with a code on a device that already
   holds a passkey still gets the enrollment offer.~~ **Closed 2026-09-01** by taking the
   round trip this spec had rejected — see the amendment above for why the objection to it
   stopped applying once the offer moved behind a session.
1a. **The cross-device residue**, which item 1 did not name. A QR sign-in suppresses the
   offer on the laptop in front of the visitor even though the credential is on their phone.
   Accepted knowingly: the only narrower gate reads a client-supplied
   `authenticatorAttachment`.
2. **Where a counter regression should actually go.** `console.warn` is a placeholder for a
   sink that can be alerted on.
3. **The rate-limiter fix**, above — scoped out, not resolved. It must now cover three call
   sites, not two: `requestCode`, `submitCode`/`beginPasskeySignIn`, and
   `reportCeremonyFailure`.
4. **`AUTH_POLICY`'s thresholds are still placeholders** (`policy.ts`) and block 3.
5. **No browser E2E exists**, so the one thing nobody can assert here is that a real
   authenticator on a real `Host` header signs in. Playwright's WebAuthn virtual
   authenticator is the obvious layer, and CLAUDE.md already names it as the missing rung.
