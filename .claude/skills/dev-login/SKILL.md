---
name: dev-login
description: Sign Claude into the locally running Guestnote app in Chrome, as any user, without asking the user for a code. Use whenever you need to look at, click through, screenshot or check a signed-in page during development -- the planner dashboard, a wedding, the couple portal -- or when a page redirects to /login. Reads the one-time code from apps/web/.mail/ instead of an inbox.
user-invocable: true
argument-hint: "[email]  (default: njoren@gmail.com)"
---

# Signing in to the dev app

Sign-in is email + a six-digit code; there is no password and no backdoor route, on purpose.
A route that mints a session for any user id was considered and rejected (2026-10-02): it
would be a second way in that only exists in development, so the flow you look at would not
be the flow that ships. Instead, in development the **console mail transport** writes every
email to disk, and you read the code from there -- the real flow, end to end.

## Preconditions

1. **The transport must be `console`.** `GUESTNOTE_MAIL_TRANSPORT` in `.env.local` set to
   `console`, or unset (unset resolves to `console` in development -- `lib/mailer.ts`).
   If it says `ses`, the code went to a real inbox and nothing lands on disk: ask the user
   before flipping it, they may be testing real mail.
   **Changing it needs a dev-server restart.** `env.ts` parses once at module load, and the
   mailer is memoised; Next's ".env changed" reload does not re-run either. Measured
   2026-10-02: after the edit, codes still went through SES until the process was restarted.
2. **The dev server is up**: `curl -s -o /dev/null -w '%{http_code}' http://app.guestnote.localhost:3000/login`
   gives `200`. If nothing listens on 3000, start it with `run_in_background`:
   `direnv exec . npm run dev`. If it hangs (curl times out) right after an `.env.local`
   edit, it is reloading -- wait ~10 s before deciding it is wedged.

## The flow (chrome-devtools MCP)

1. Open `http://app.guestnote.localhost:3000/login`. If it lands somewhere other than
   `/login`, you are already signed in -- the MCP's Chrome profile is persistent, so a
   session survives between conversations until it expires.
2. Fill the textbox **"E-mailadres"** (UI is Dutch by default), click **"Doorgaan"**.
3. Wait for the page to say "Voer je code in", then read the code from the newest file:

   ```bash
   f=$(ls -t apps/web/.mail/*.txt | head -1); echo "$f"; grep -Eo '\b[0-9]{6}\b' "$f" | head -1
   ```

   **Check the filename's timestamp and address before using it** -- the directory keeps
   every old mail, and a stale code fails as "wrong code", which looks like an app bug.
   The filename is `<ISO time, UTC>-<seq>-<address slug>.txt`.
4. Fill **"Code van zes cijfers"**, click **"Aanmelden"**. Codes expire in 5 minutes.
5. You land on `/?welcome=passkey`. For a user with a studio the shell then offers to add a
   passkey (`enrollment-prompt.tsx`). Dismiss it, because you can't complete WebAuthn from here.

## Several users at once

Each role wants its own cookie jar: open the second one with `new_page` and an
`isolatedContext` name (`"couple"`, `"vendor"`, ...). Pages in one context share cookies;
contexts do not. Then run the same flow in that page with that user's email.

A new email creates an account on first verification -- that is the registration flow -- so
any address works with the console transport (SES sandbox would reject it). But a fresh
account belongs to nothing: the planner has to invite it (couple, staff) for it to see a
wedding.

## "Hoort nog bij geen enkele organisatie"

Signed in, but no org. Usually because **`npm run test:db` truncates the same Neon `dev`
branch `npm run dev` serves** (`packages/db/README.md`), which wipes studios and
memberships but not necessarily the user. Recover through the product: `/signup`
("Start je studio") makes a studio and its owner. Tell the user you did, since it is their
dev data.

## Never

- On staging or production. There is no console transport there (`mailer.ts` throws if
  asked), and the codes go to real inboxes.
- Reading the code from the database: Better Auth stores it hashed (`storeOTP: 'hashed'`).
