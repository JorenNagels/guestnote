---
version: 1
slug: "src-app-pro-public-login"
primary_target: "src/app/pro/(public)/login"
related_targets: ["src/app/pro/(public)/invite"]
---

# Sign-in and invitation acceptance — `app.guestnote.be`

Design brief. Shape output: no code, no direction contract, no DESIGN.md change.

- Concept locked 2026-08-18 (surface round, bolder re-roll): **The descent**.
- Credential model locked 2026-08-18, after Appendix A: **passkey primary, email code fallback**.
  This supersedes the earlier magic-link-only decision of the same day. **No magic link
  is sent at any point**, and no password exists anywhere in the system.

---

## 1. Job and audience

**Mode: Operate.** The visitor completes a task and leaves. Nothing here persuades anyone
of anything; they already own an account or hold an invitation.

| | |
|---|---|
| Primary | 🎩 the planner, `org_members.owner` or `.admin` |
| Also served | 🎩 a second planner on `org_members.member`, arriving by staff invitation |
| Not served here | 👰 couple, 🏛 venue-as-distinct-tier, 🤝 vendor, and the wedding guest |

Two scenes, and they are not alike:

- **The desk.** Laptop, between weddings, inbox open in the next tab. Sign-in is
  incidental; a slow flow costs annoyance.
- **The venue, on the day.** Phone, one bar of signal, hands full, the run sheet behind
  this screen. Here a failed sign-in is not annoyance — it is the product not existing at
  the only moment it was needed.

The second scene is what this brief is designed against, and it is the whole reason the
credential model changed: **a passkey resolves that scene without email being involved at
all.** Face ID, one second, no inbox, no signal-dependent round trip beyond the assertion
itself.

**Couple-side is out of scope and assumed separate** (user decision, 2026-08-18). One
binding consequence: the `invitations` table is already merged (`wedding_id NULL` → staff,
`wedding_id SET` → couple/editor), so the invite route must parse both shapes and refuse
the wedding shape with an honest "not yet" rather than a 404 — a couple invitation landing
on a 404 reads as a bug to the planner who sent it.

---

## 2. Outcome and proof

**Primary task:** get from a cold browser to the authenticated shell.

**Success:** the planner in the venue car park, on a phone, gets in — including on a device
they have used before (passkey, no email), and including on one they have not (code, email).

### The credential ladder

Exactly one path is offered at a time. Each rung is reached only when the one above it is
unavailable — the visitor is never shown a menu of methods, which is the single finding in
Appendix A that most shaped this design.

| # | Method | Who lands here | Interaction cost |
|---|---|---|---|
| 1 | **Passkey via conditional UI** | returning planner, enrolled device | the OS sheet offers it *from the email field itself*; Face ID; done. No button pressed, no email sent. |
| 2 | **Passkey via explicit control** | enrolled device, browser without conditional UI | one tap, then Face ID |
| 3 | **Passkey cross-device (QR)** | desktop, passkey lives on the phone | the platform draws the QR and runs the hybrid transport; we must simply not suppress it |
| 4 | **Email code, 6 digits** | first sign-in ever · new device · lost authenticator | type email → code arrives → autofilled above the keyboard on iOS, typed or pasted elsewhere |

Rung 4 is the floor **and** the recovery path. There is nothing beneath it.

> **Say this plainly rather than discover it later.** With an email code as recovery, the
> account's security ceiling is the planner's email account. Passkeys make the *common*
> path phishing-resistant; they do not make the account phishing-proof while any email
> fallback exists. That is the correct trade for this product — the alternative is locking
> a planner out of a live wedding — but it means the interesting question is not "is
> sign-in secure", it is **which operations should require a fresh passkey assertion rather
> than a session**. That question belongs to the shell, not here, and §7 records it.

**Why no magic link, in one line:** Appendix A. Corporate mail scanners spend single-use
link tokens before delivery, and Better Auth's link signs you in *in whichever browser
opened it*, silently stranding the tab that asked. A six-digit code has neither failure.

**Real evidence available to this surface:** the mark, the trilingual catalogues, the token
layer. **Nothing else.** No testimonials, no customers, no screenshots, no uptime claims —
PRODUCT.md is explicit that none exist, and a login page is the classic place they get
invented.

**Product truth this surface can honestly carry:** the interface is trilingual before you
are authenticated. The language switcher on rung 0 is not chrome — it demonstrates the one
competitive claim (NL+FR+EN as a platform property, not Weddamo's €139 add-on) before
login, at zero cost, to a planner who is evaluating.

---

## 3. Selected direction — "The descent"

**Visual authority: inherited, unchanged.** `design-system/tokens.css` is the world. No new
hue, no new type family, no new component character. Inter stands as PRODUCT.md records it
— acknowledged-generic, revisited with the PH4 template designer, not here.

**Structural thesis.** `guestnote.be` is `public, s-maxage=60, swr=86400`.
`app.guestnote.be` is `private, no-store`. That boundary is asserted in tests and is
invisible to the person crossing it. This surface makes it visible: **the ground steps one
stop deeper down the neutral ramp at each rung the visitor completes**, so signing in reads
as descending out of the public web into a private workspace.

It earns its place on three grounds:

1. It is the only screen in the product with no data on it — therefore the only one that
   can carry an idea, and the only place the dashboard's table-first discipline is not the
   right answer.
2. The depth is *state*, and state is what a passwordless handshake hides.
3. It costs one custom property and a transition. No illustration, no photography, no asset
   anyone has to produce.

**Sequence.** Three rungs, monotonic, no branching. **The passkey path skips the middle
one entirely** — which is exactly what "primary" should feel like: the fast path is
visibly shorter, not merely faster.

```
rung 0  IDENTIFY   public ground     email field, passkey offered from the field
   │                                   └── passkey resolves ───────────┐
rung 1  VERIFY     one stop deeper   six-digit code (email path only)  │
rung 2  ARRIVE     deepest stop      session established  ◄────────────┘
                                     → the shell lifts into the user's own theme
```

**Focal moment.** The step between rungs. The submit is the only warm thing on a cool
screen, and the ground moves under it. Under half a second, once per sign-in, and it is the
entire budget for personality on this surface.

**The lift is deliberate.** The descent does *not* end in a dark dashboard — the shell
renders in whatever theme the user has. Rung 2 is the deepest point and the shell is the
surfacing. Descending into the shell would mean this surface dictating the dashboard's
theme, which it has no authority to do.

### Depth stops — verified, not asserted

Both ramps below were run through the same contrast check as every other pair in
`08-design-system.md`. **26 pairs, 0 failures.** The first ramp proposed for this brief
(`neutral-50 → neutral-200 → neutral-800`) produced 4 failures and was discarded rather
than shipped; `neutral-300` as a middle stop was also discarded (muted text at 4.28:1).

**Light**

| Rung | Ground | Body | Muted | Input border | Action | Action label | Error |
|---|---|---|---|---|---|---|---|
| 0 | `neutral-50` | `neutral-950` 12.7:1 | `neutral-800` 6.5:1 | `neutral-700` 4.6:1 | `teal-800` | `#FFF` 6.8:1 | `danger-900` 8.4:1 |
| 1 | `neutral-200` | `neutral-950` 10.4:1 | `neutral-800` 5.1:1 | `neutral-700` 3.7:1 | `teal-800` | `#FFF` 6.8:1 | `danger-900` 6.5:1 |
| 2 | `neutral-900` | `neutral-100` 8.2:1 | `neutral-200` 7.1:1 | `neutral-500` 3.4:1 | `teal-300` | `neutral-950` 8.9:1 | `danger-300` 6.1:1 |

**Dark** — the metaphor runs in the same direction; it descends the dark end of the ramp
rather than inverting.

| Rung | Ground | Body | Muted | Input border | Action | Action label | Error |
|---|---|---|---|---|---|---|---|
| 0 | `neutral-900` | `neutral-100` 8.2:1 | `neutral-200` 7.1:1 | `neutral-500` 3.6:1 | `teal-300` | `neutral-950` 8.9:1 | `danger-300` 6.1:1 |
| 1 | `neutral-950` | `neutral-100` 12.1:1 | `neutral-200` 10.5:1 | `neutral-500` 5.3:1 | `teal-300` | `neutral-950` 8.9:1 | `danger-300` 9.0:1 |
| 2 | `neutral-1000` | `neutral-100` 15.2:1 | `neutral-200` 13.2:1 | `neutral-500` 6.7:1 | `teal-300` | `neutral-950` 8.9:1 | `danger-300` 11.3:1 |

Note what the table already tells you: **light rung 2 and dark rung 0 are the same
surface.** The descent converges, which is why the two themes need one component and not
two.

**Implementation consequence.** The ground is one custom property on the flow's root
element, stepped by rung. Not three routes and not three layouts — the whole flow is one
route segment holding one state machine, so a rung change never remounts the field being
typed into and never costs a navigation on venue wifi.

---

## 4. Scope and boundaries

**Named target:** `apps/web/src/app/pro/(public)/` — the unauthenticated branch of root
layout B, beside the `(app)/` branch that gets the session shell at M3.

**Public URLs** (`/pro` never appears in a URL bar; `proxy.ts` owns the rewrite):

| Public | Internal | Purpose |
|---|---|---|
| `app.guestnote.be/login` | `/pro/login` | rungs 0–2 |
| `app.guestnote.be/invite/<token>` | `/pro/invite/[token]` | invitation landing, then rungs 0–2 |

`routes.ts` carries `app.login()` already; it gains `app.invite(token)`. No bare string
literals — that file is the compensation for `typedRoutes` being off.

**In scope:** rungs 0–2 and every state in §5 · the passkey ladder, all four steps · staff
invitation acceptance (`invitations.wedding_id IS NULL`, role `admin` | `member`) and the
first-run name capture that nullable `users.name` implies · the passkey enrollment prompt's
*trigger contract and copy* (the shell hosts it — see §6) · the pre-login language switcher
· the session-expiry return with destination preserved · the `auth` namespace in all three
catalogues.

**Out of scope**

| Not building | Why |
|---|---|
| Self-serve signup / org creation | Scoped out by the user. Orgs are founder-seeded until pricing mechanics settle. |
| Magic link | Superseded. Appendix A. |
| Password, reset, "set one later" | None exists in the system. |
| Social / OAuth sign-in | Adds an identity sub-processor to the DPA and undercuts research/07's "no identity sub-processor to name at all". |
| SMS as a fallback | A second channel, a per-message cost, and a phone number Guestnote does not otherwise need under GDPR minimisation. |
| Passkey *management* (rename, revoke, list) | Belongs in account settings, not the door. |
| Couple / vendor / guest entry | 👰 assumed separate; guests never get accounts, ever. |
| White-labelling this screen | PRODUCT.md: white-label is scoped to client sites and emails. |
| The authenticated shell | Rung 2 hands off. |

**Must remain untouched:** `design-system/tokens.css` (no new token without a contrast
run); the three-root-layout rule; the `private, no-store` posture; the rule that `/pro`
never reaches a URL bar.

**Anti-goals.** No split brand panel with a marketing pitch. No invented proof of any kind.
No product screenshot, illustration, or stock photography. No "welcome back 👋". No method
menu. Nothing a planner has to read past to reach the field.

---

## 5. States and ranges

**Enumeration resistance is the rule:** an unknown email produces the identical rung-1
screen as a known one. The system never confirms whether an account exists — the same
posture as research/07's *"neither → 404, not 403 — don't confirm the wedding exists."*

### Passkey

The two rows in bold are the ones implementations get wrong.

| # | State | Cause | What the screen must do |
|---|---|---|---|
| 1 | Offered | conditional UI fires on the email field | nothing visible from us — the OS owns the sheet. Do not draw a competing prompt. |
| 2 | **Cancelled** | user dismissed the OS sheet | **not an error.** No red, no message. Return to rung 0 exactly as it was, field still focused. This is a routine, frequent, deliberate act. |
| 3 | Unsupported | no platform authenticator, or conditional UI unavailable | silently fall to the email path. Never explain a capability the visitor cannot act on. |
| 4 | Cross-device | desktop, passkey on phone | the platform draws the QR; our screen states only that it is waiting |
| 5 | Unknown credential | passkey deleted server-side, or wrong account | say the passkey is no longer valid for this account, then offer the code path in the same breath |
| 6 | **Counter regression** | possible cloned authenticator | refuse the assertion, fall to the code path, and log it. Never explain the reason on screen. |
| 7 | Timed out | sheet left open | back to rung 0, no error |

### Email code

| # | State | Cause | What the screen must do | Recovery |
|---|---|---|---|---|
| 8 | Empty | first load | field focused, one action, switcher visible | — |
| 9 | Invalid format | typo | inline, on blur, never on keystroke | correct in place |
| 10 | Sent | any valid email, known or not | descend to rung 1, state the address back, start the resend countdown | — |
| 11 | Wrong code | mistyped | attempts remaining as a number | retype |
| 12 | Attempts exhausted | ceiling hit | the code is dead; say so plainly | request a new one |
| 13 | Expired | TTL passed | say "expired", never "invalid" | one-tap resend |
| 14 | Rate limited | per email and per IP | state when they may retry, as a duration | wait |
| 15 | Session expired | returning mid-work | rung 0, one line, destination preserved | sign in, land where they were going |
| 16 | Offline | venue wifi | report that the network is unreachable; typed input is never lost | retry |
| 17 | Bounced | `email_log` hard bounce | say the address did not accept mail | different address |

### Invitation

| # | State | Cause | What the screen must do |
|---|---|---|---|
| 18 | Valid staff invite | `wedding_id NULL`, unexpired, unaccepted | name the inviter, the org and the role in one sentence, then rung 0 with the email **pre-filled and locked** |
| 19 | First-run name | `users.name IS NULL` after verification | ask once, between rung 1 and rung 2 |
| 20 | Expired | past `expires_at` | name who invited them; say to ask that person for a new one |
| 21 | Already accepted | `accepted_at` set | route to sign-in; not an error |
| 22 | Wrong account | a different email is already signed in | state both addresses; offer sign out and continue |
| 23 | Wedding-shaped invite | `wedding_id SET` | an honest "the couple portal isn't open yet", never a 404 |
| 24 | Unknown / malformed token | guessed, truncated, purged | one generic message; never distinguish these three |

### Enrollment (post-authentication; hosted by the shell)

| # | State | Cause | What must happen |
|---|---|---|---|
| 25 | Offered | first successful sign-in on a device with no passkey | one modal, at the success moment, with a benefit sentence and a real "Niet nu" |
| 26 | Declined | "Niet nu" | do not ask again this session; re-offer after the next code sign-in |
| 27 | Already enrolled here | a passkey for this device exists | never offer |
| 28 | Failed | OS error, or credential already registered | one line, dismiss, continue into the shell — never block arrival |

### Ranges

| Thing | Min | Typical | Max / worst |
|---|---|---|---|
| Email | 6 chars | `voornaam@studiowit.be` | 254 — must not wrap or ellipsise on rung 1 |
| Inviter + org sentence | short NL | `Ilse Verhoeven nodigt je uit bij Studio Wit` | FR runs ~30% longer; wraps to 3 lines without moving the field |
| Code | 6 digits, always | — | — |
| Locales | 3 | NL default | FR longest |
| Passkeys per user | 0 | 1–2 (laptop + phone) | many; this surface never lists them |
| Orgs per user | 1 | 1 | >1 → rung 2 lands in the last-used org; the shell's switcher owns the rest (decided 2026-08-18) |

**Three distinct empty-ish states**, per PRODUCT.md: *nothing entered yet*, *waiting on a
code*, and *the code failed* are three different messages, never one string.

---

## 6. Interaction and layout

**Topology.** One route segment, one state machine, three rungs. No modal in the flow, no
accordion, no multi-page wizard. Back is meaningful: from rung 1 it returns to rung 0 with
the address retained and editable.

**Hierarchy at every rung:** the question, the control, the action. Switcher, resend,
change-address and help are subordinate — below the fold of attention, not of the screen.

**Composition.** A single column on a full-height field, optically centred slightly above
true centre. The column never changes width or horizontal position between rungs; only the
ground moves and the contents swap. Nothing may jump — that is what makes the descent read
as one continuous movement rather than three pages.

**The passkey affordance is the field, not a button.** The email input carries
`autocomplete="username webauthn"` (webauthn last), and conditional mediation is preloaded
on mount. A returning planner sees their own passkey offered in the browser's own sheet
without our UI claiming anything. The explicit control exists only as the fallback for
browsers without conditional UI, and it is secondary weight — a primary-weight "Sign in
with a passkey" button next to an email field is the method menu this brief refuses.

**Responsive.** Phone is the design case, not the adaptation. One column throughout; the
layout never restructures at a breakpoint, it only gains margin. Controls stay at
comfortable height (44px) regardless of `data-density` — density is a dashboard preference
for reading 300 rows, and a six-digit code in a car park needs the large target. Density is
not settable here: pre-authentication there is no user row to persist it to.

**The code field.** One input, not six boxes: it must accept a pasted `194 720` with the
space, survive autofill, and be selectable in one gesture. `inputmode="numeric"`,
`autocomplete="one-time-code"`, tabular figures. On iOS this is what puts the code above
the keyboard, so the attribute is load-bearing, not decoration.

**Other affordances.** The address on rung 1 is displayed *and correctable in place* —
"wrong address" is the most common recovery and must not cost a page. Resend is disabled
with a visible countdown, never a silently ignored tap. The submit reports idle, in-flight
and failed, and never disappears.

**Transitions.** One transition exists here: the ground stepping between rungs, under
400ms, ease-out. Content cross-fades; it does not slide. Under
`prefers-reduced-motion: reduce` the ground steps instantly and the cross-fade is dropped —
the depth still communicates, because it is a static difference, not an animation.

**Enrollment prompt** (spec'd here, hosted by the shell). A modal at the post-login success
moment — never mid-flow, where it converts worse. One benefit sentence answering "what does
this do", one primary action, one real "Niet nu". Evidence: eBay reports triggered prompts
driving ~102% higher adoption than a settings entry, with ~75% of all enrollments coming
from that single post-login trigger.

**Accessibility — WCAG 2.2 AA is a hard gate.**

- **Depth is never the only signal.** Each rung carries a text label naming where the
  visitor is. Principle 5 — encode meaning twice — applied to the one screen with no status
  chip on it to do the job.
- Rung changes and every error announce through a live region; focus moves to the new
  control on rung change, and to the error on failure.
- The `--input` 3:1 minimum holds at all six stops (§3) — the field's edge is the entire
  interface here.
- Full keyboard path end to end. The passkey sheet is OS-owned and already accessible; do
  not trap focus around it.
- Target sizes clear 2.5.8 at 44px.

**Copy.** All three catalogues, new `auth` namespace, **NL authored first, not translated
last**. Plain, second person, no exclamation marks, no apology, no "oops". Every error names
what happened and then what to do, in that order. The word for the code is the same word in
the email and on screen in all three languages — a mismatch there makes the whole fallback
useless.

---

## 7. Constraints and open decisions

### Binding

- Next.js 16 App Router; root layout B (`/pro`), `private, no-store`.
- Better Auth self-hosted, **authentication only**, plus the `passkey` and `emailOTP`
  plugins. `advanced.database.generateId` must force `uuid` — a `text` id here is a
  column-type migration across six tables later.
- `packages/core/auth` is the only module importing Better Auth, enforced by a test.
- **`rpID` is `app.guestnote.be`. Not `guestnote.be`.** This is the one decision on this
  surface that genuinely cannot be retrofitted:
  - A passkey scoped to a registrable suffix is usable by **every subdomain beneath it**.
    PH4 serves per-tenant wedding sites on `<slug>.guestnote.be` with per-wedding theming —
    user-influenced content. With `rpID = guestnote.be`, script on a tenant subdomain could
    request assertions for planner credentials.
  - `rp.id` is hashed into the authenticator at creation and can never be edited. Changing
    it later invalidates every passkey in existence.
  - Consequence to accept: `withguestnote.com` cannot share these passkeys without Related
    Origin Requests. `pro.guestnote.be` is unaffected — it redirects before WebAuthn runs.
- The new `passkey` table (`credentialID`, `publicKey`, `counter`, `deviceType`,
  `backedUp`, `transports`, `aaguid`) is **not tenant-scoped** — it hangs off `users`, like
  `sessions`. It gets no `org_id`, and it must be named in the migration comment as a third
  deliberate exception alongside `org_members` and `wedding_members`.
- Session cookie: `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Lax`.
- Accepting a staff invitation writes `org_members` and **no** `wedding_members` row.
- Pre-login locale from the `NEXT_LOCALE` cookie, never `Accept-Language`. The switcher is
  visible and remembered; at M3 the user row takes over and the cookie becomes the
  pre-login fallback.
- GDPR: `eu-central-1` only; auth mail rides the existing SES + react-email + next-intl
  pipeline. Passkeys add no personal data beyond a public key and a device label.

### Components this establishes

This is the first real UI in `apps/web`, so it sets precedent whether it means to or not:
the field, the label, the inline error, the button's three states, the live region, and the
language switcher. They belong in `packages/ui` from the first commit, not extracted after.

### Open — a builder must not invent these

1. Code TTL. Better Auth's `emailOTP` default is **300s**; the brief argues that is short
   for venue wifi. Not ratified.
2. `allowedAttempts`. Better Auth default is **3**. Not ratified.
3. Rate-limit thresholds per email and per IP, and whether they share a store.
4. Session length and whether it rolls. Passkey-primary weakens the case for a very long
   session, because re-authentication is now cheap on an enrolled device. Not chosen.
5. `residentKey` and `userVerification`: Better Auth defaults both to `preferred`.
   `required` buys usernameless sign-in and guaranteed biometrics at the cost of older
   authenticators. Not chosen.
6. `authenticatorAttachment`: platform-only, or also cross-platform security keys.
7. **Which operations require a fresh passkey assertion rather than a session** — the real
   security question once email is the recovery floor (§2). Belongs to the shell.
8. Whether the invitation email and the code email are one template or two.

---

## Amendment, 2026-08-18 — the descent moved off the page ground

Built, looked at, and changed. Two problems the screenshot showed that the prose did not:

1. **A whole viewport of flat neutral reads as unfinished, not calm.** The form occupied
   26% of a 1280px width and nothing else was doing anything.
2. **The descent was invisible until you moved.** Depth you can only perceive by
   remembering the previous screen is not depth.

A third turned up in the contrast run: with the form on a descending ground, error text
failed at the deepest stop — `danger-300` on `neutral-800` is 4.07:1, and needs 4.5.

So the layout is now a split. The form sits left on the ordinary `--background`, using the
semantic tokens already verified in `design-system/tokens.css` — which discharges problem
three outright, since it no longer moves. **The descent moved to an inset panel on the
right**, whose sky steps `teal-300 → teal-700 → teal-950` with gold high and a deep pool
low. Measured in the browser at each rung: `#9AD8D2`, `#2C7D77`, `#0A312E`.

The idea survives the move intact, and reads better: the form stays lit and constant while
the world beside it darkens. Below 1024px the panel is not drawn at all, which is the right
answer on the day-of phone regardless.

**What is on the panel, and what may never be.** The chips are the six real RSVP status
triples. The card is the T-minus mechanic every due date hangs off, rolling to the next
12 September so the countdown is never negative, with `Els & Jan` — one of the two live
weddings PRODUCT.md names as usable. Never: a mock of the planner dashboard, any metric,
any customer or partner logo. The reference the user gave (`app.introw.io/login`) shows
integration logos and a product card with a number in it; Guestnote has no integrations
and PRODUCT.md forbids the number.

**Also added.** A "no account yet — Guestnote is invite-only" line under the form. It
answers the only question an empty login page raises, and stops a planner hunting for a
Create account link that does not exist.

**Entry point.** `guestnote.be` gained a header **Inloggen** button that navigates to
`app.guestnote.be/login`. Not an overlay: the session cookie is `__Host-` prefixed and so
pinned to one host, meaning a login completed on the apex could never mint a session the
dashboard can read. After verification the flow redirects to the dashboard rather than
resting on a screen that congratulates you for signing in.

---

## Prototype

`design-system/login-flow.html` — standalone, imports the real `tokens.css`, nothing ships
from it. The live flow (both scenarios, both device widths), the verified ramp table, and
all of §5 rendered as a gallery, in three languages and both themes. State is hash-driven,
so any cell of the matrix is a link: `#dark,fr,rung1`, `#light,nl,passkey`.

It sits in `design-system/` beside `tokens-reference.html` for the reason that file states —
a visual reference kept next to what it references cannot silently drift from it.

---

## Built 2026-08-18

| | |
|---|---|
| Routes | `pro/(public)/login`, `pro/(public)/invite/[token]` — both `ƒ` dynamic in the build output, as `private, no-store` requires |
| Flow | `components/auth/auth-flow.tsx` — one client state machine, three rungs, no navigation between them |
| Descent | `pro/(public)/descent.css` — the split shell and the panel's sky, three rungs, with the discarded ramps recorded in the file |
| Seam | `packages/core/auth` — types, `AUTH_POLICY`, and an in-memory dev provider. `biome.json` already restricted `better-auth` to `packages/core/src/auth/better-auth.ts`, which is W3's landing spot |
| Primitives | `packages/ui` — `Button`, `LinkButton`, `Field`, `InlineError`, `LiveRegion`, `LocaleSwitcher`, on a six-slot colour contract so no component knows the descent exists |
| Copy | `auth` namespace, 46 keys, identical key set across nl/en/fr, asserted at generation |
| Tests | 9 cases in `dev-provider.test.ts`, each named for the numbered state it covers |

Gate: `npm run check` green (typecheck, biome, 83 unit tests). Flow driven end to end
against the dev server — rung 2 measured at `rgb(71,68,65)`, which is `--neutral-900`,
the value this document specifies.

**Not built, and deliberately.** There is no session. `packages/db/src/schema/auth.ts` is
explicit that `sessions`, `accounts` and `verifications` arrive in W3 "read off the output
of Better Auth's own schema generator rather than guessed", so building them now is the
exact failure that file exists to prevent. The surface renders its arrival state; the
cookie, the passkey ceremony and the org resolution are W3/M3. `passkeysAvailable()`
returns false until then, which the interface treats identically to a browser with no
platform authenticator — states 2, 3 and 6 already render the same.

## Built 2026-08-31 — passkey sign-in

The paragraph immediately above is a record of 2026-08-18 and is now history on every point.
Sessions, the cookie and enrollment landed 2026-08-19; the **sign-in** ceremony landed today,
specified in `docs/specs/0002-signing-in-with-a-passkey.md`.

`passkeysAvailable()` now returns `true`, and it means both halves are wired — for eleven
days it meant only that the server could verify a credential, so a passkey could be created
and never used. The browser still has the final say through `conditionalMediationAvailable()`
and `platformAuthenticatorAvailable()`.

What the §5 Passkey table asked for is built as written: conditional mediation preloaded on
mount with no control drawn, the secondary-weight control only where conditional UI is
absent, the passkey path skipping rung 1, and cross-device left unsuppressed. Two departures
worth recording here rather than only in the spec:

- **State 6's log is wider than asked.** A counter regression cannot be told apart from a bad
  signature at our seam — the plugin catches SimpleWebAuthn's throw and rethrows a flat
  `AUTHENTICATION_FAILED` — so every failed assertion is logged with its credential id.
  Nothing is said on screen, as required.
- **State 27 is only partly covered.** The enrollment offer is suppressed after a passkey
  sign-in, but not after a code sign-in on a device that already holds one, and it is
  suppressed after a *cross-device* sign-in where the credential is on a phone rather than
  this laptop. Both are named in the spec's "Still open".

Not built, still: `.impeccable` state 25's placement (rung 2 hosts the enrollment prompt until
M3 gives it a shell to live in), and passkey management, which §"Not in scope" puts in account
settings.

## Amended 2026-09-01 — the enrollment prompt left this surface

State 25's placement is built, and it is no longer on this page. The prompt moved to the
shell (`components/auth/enrollment-prompt.tsx`), which is what §"Not built, still" above was
waiting for.

**This surface's rung 2 is now purely a transition again.** It draws the tick, the arrive
copy and the continue button, and it leaves after `DESCENT_MS` with nothing able to hold it
open. Its one remaining contribution to enrollment is a `?welcome=passkey` marker on the
continue href, because it is the only place that knows which rung the visitor came off.

**The first half of state 27 is now covered too.** The shell asks the server whether this
user holds any passkey — a read the account's own owner performs about themselves, which is
why the disclosure objection that rejected it in the spec does not apply behind a session. A
code sign-in on a device that already holds a passkey no longer gets an offer. The
cross-device over-reach in the second bullet above stands, and stands knowingly.

**And the page redirects a signed-in visitor to the dashboard again.** That guard was removed
on 2026-08-31 because it made enrollment structurally impossible — a re-render triggered by
the challenge cookie threw the visitor out with the OS sheet still open. With no ceremony on
this surface there is nothing left for it to interrupt. The rule the page encodes now is
"this surface owns no multi-step ceremony", not "signed-in visitors get redirected"; anything
added here that must survive a re-render has to move, or the guard has to go again.

**Found while building, and fixed 2026-09-01:** `/favicon.ico` was a 500 on every deployed
page load. It is excluded from proxy.ts's matcher, so nothing rewrote or 404'd it early; it
fell through to `(marketing)/[locale]`, a ROOT layout, whose `notFound()` has no boundary
above it and renders a 500. `apps/web/public/favicon.ico` now exists, and returns 200
`image/x-icon` on all three hosts (measured 2026-09-01). `robots.txt` and `sitemap.xml` are
excluded by the same matcher and still do not exist — same route, 404 locally, deployed
behaviour not read back; crawlers only. Recorded in proxy.ts rather than fixed blind, because
an empty `robots.txt` is a decision about indexing.

**Also found while building:** a file in `apps/web/public/` is unreachable on the app host.
proxy.ts rewrites every non-`/api` path to `/pro/*` and its matcher excludes only
`_next/static`, `_next/image`, `favicon.ico`, `robots.txt` and `sitemap.xml`. The mark is
inlined instead, which is better here anyway; the finding is recorded in proxy.ts beside
the matcher.

---

## Verification, when this is built

One batched round, not a loop: desktop and mobile together, light and dark, all three
locales, at rungs 0, 1 and the highest-traffic error states (2, 10, 13, 14). The contrast
run in §3 is already discharged and must be re-run only if a token changes.
# Appendix A — Credential model: the evidence

Added 2026-08-18 after the code-vs-link question was reopened. The §2 claim that
"the same email carries a six-digit code as well as the link, against the same
`verifications` row" was asserted, not researched, and is **wrong on the
implementation detail**: Better Auth's magic-link and email-OTP are separate plugins
with separate verification records. The rest of this appendix is what the research
actually says.

## A.1 What breaks a magic link in practice

| Failure | Mechanism | Applies to Guestnote? |
|---|---|---|
| **Scanner pre-click** | Microsoft Defender Safe Links, Proofpoint, Mimecast and Barracuda rewrite and *fetch* every URL in inbound mail before delivery. A single-use token is spent by the scanner; the human gets "link expired." | **Yes, and it is the biggest one.** Belgian venues and established planner studios run Microsoft 365 business mail. This is the documented reason Slack uses a numeric code instead of a link. |
| **Wrong browser** | The link opens in the mail client's in-app browser or the OS default, not the browser that asked. | **Yes**, and it behaves *differently* here than the well-known Auth0/NextAuth case. Those fail loudly because verification needs a cookie set at request time. Better Auth's token carries the auth itself, so the click **succeeds — in the wrong browser**, leaving the original tab waiting forever. A silent split is worse to debug than an error. |
| **Token single-use** | Better Auth consumes the token atomically on first attempt; retries fail. | Yes. Mitigated since PR #5552, which added an attempts allowance to the magic-link plugin specifically because scanners were burning tokens. Raising it means the link is replayable inside its window. |
| **App-switch cost** | Leave browser → mail → back. | Yes on the day-of phone, and this is where it hurts most. |

## A.2 What the code path actually costs on a phone

The "codes mean more typing" assumption does not survive contact with iOS.

- Since **iOS 17**, Safari autofills verification codes **from Apple Mail**, offered
  directly above the keyboard, and the OS deletes the code after use. **iOS 26**
  extends this to third-party apps. The hook is `autocomplete="one-time-code"`.
- So on an iPhone the code path is: type email → tap the suggestion above the
  keyboard → in. **The user never leaves the browser.** The link path, by contrast,
  requires leaving it.
- On desktop the code costs six keystrokes, or one paste. macOS Mail + Safari
  autofills it too.

A code is also structurally immune to both failures in A.1: a scanner fetching a URL
cannot consume a number, and a number crosses a browser boundary in the user's head.

## A.3 What comparable products ship

| Product | Method | Stated reason |
|---|---|---|
| Notion | Magic link only, every login, since 2019 | Lowest friction, no passwords at all |
| Slack | Numeric code, not a link | Corporate mail security pre-clicks links |
| NN/g guidance | No single method for everyone; offer a choice *after* account creation, never force one | Observed cross-device and password-manager confusion |

## A.4 Passkeys, honestly

2026 figures: ~5 billion active passkeys, 75% consumer recognition, 49% use them where
offered. FIDO reports 68% of surveyed organisations have deployed or are deploying
passkeys for workforce sign-in, though only ~30% as the *primary* method. Vendor-reported
outcomes for SaaS: ~73% faster sign-in and ~81% fewer login support tickets — treat those
two as directional, not audited.

For Guestnote specifically: Face ID on the day-of phone is the best possible answer to the
car-park scene, and it removes email from the critical path entirely. Against it —
PRODUCT.md records the audience skewing older on the venue side, a passkey needs an
enrollment moment that a first-time invited user does not yet have, and it always needs a
fallback ladder anyway, which means building one of the email methods regardless.

## A.5 The one constraint that cuts across all of it

Conversion research is consistent that **choice paralysis at the login screen measurably
hurts completion**: the method should be singular and obvious, not a menu. That is a
direct argument against the original §2 proposal of putting a link *and* a code in front
of the user at the same moment, and it is the finding that most changes this brief.

Sources: Auth0 and Okta magic-link documentation · Better Auth magic-link, email-OTP and
passkey plugin docs and issues #5550 / #5552 / #8163 · Microsoft Learn, Safe Links
overview · NN/g, *Passwordless Accounts: One-Time Passwords (OTPs) and Passkeys* · FIDO
Alliance 2026 report · Apple Developer, *Providing one-time passcodes to AutoFill*.
