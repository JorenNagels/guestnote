import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, tstz, updatedAt } from './_shared.ts'

/**
 * Better Auth's territory -- but only `users`, and only because half the schema
 * has a foreign key to it.
 *
 * `sessions`, `accounts`, `verifications` and `passkeys` arrived 2026-08-18, read off
 * `getAuthTables()` in the INSTALLED better-auth@1.7.1 rather than guessed -- see the
 * note above `sessions` for why that function and not `@better-auth/cli`.
 *
 * The one thing that CANNOT wait, because every policy and every foreign key
 * depends on it: **ids are `uuid`**, not Better Auth's default `text`. The RLS
 * policies cast `current_setting('app.user_id', true)::uuid`
 * (research/07-auth-and-tenancy.md section 4a), so W3 must force uuid generation
 * via Better Auth's `advanced.database.generateId` rather than accept its default.
 * Getting that wrong means a column-type migration across `org_members.user_id`,
 * `wedding_members.user_id`, `invitations.invited_by`, `tasks.assignee_user_id`,
 * `task_comments.author_user_id` and `audit_log.actor_user_id`.
 *
 * Not tenant-scoped, and not RLS-protected on the tenant axis: a user is not owned
 * by an organisation. One person can be a couple on one wedding and staff at a
 * planner. Reachability is decided by `org_members` / `wedding_members`, which are
 * the tables that do carry policies.
 */
/**
 * Better Auth's own tables, reconciled 2026-08-18 against better-auth@1.7.1.
 *
 * ## Where these shapes came from
 *
 * `getAuthTables()`, called on the installed package with this project's exact plugin
 * set, which is the same function `@better-auth/cli` calls. It was used INSTEAD of the
 * CLI because the CLI's latest is 1.4.21 while the runtime here is 1.7.1: generating a
 * schema from a version behind the one that will query it is precisely the guessing this
 * file was written to prevent. Re-run `getAuthTables()`, exported by the library's own
 * `db` entry point, after any better-auth upgrade.
 *
 * ## Four deliberate divergences from what it returned
 *
 * 1. **`uuid` primary keys, not `text`.** Better Auth defaults to text ids. Every policy
 *    in 0001_rls.sql casts `current_setting('app.user_id', true)::uuid`, and six columns
 *    already hold a `uuid` foreign key to `users.id`. `advanced.database.generateId` in
 *    packages/core/src/auth/better-auth.ts forces this, and getting it wrong is a
 *    column-type migration after real users exist.
 * 2. **Plural table names.** Better Auth models are singular (`session`, `account`); every
 *    other table here is plural. The `modelName` overrides in the auth config carry this,
 *    so the divergence costs one line each and keeps the schema readable.
 * 3. **`users.name` stays nullable**, though better-auth marks it required. A staff
 *    invitation creates the account before anyone has typed a name -- the sign-in surface
 *    asks for it once, between verification and arrival. A NOT NULL here would make that
 *    ordering impossible.
 * 4. **`snake_case` columns** throughout, via `fieldName` in the config.
 *
 * ## No row level security on any of them, for the reason `users` has none
 *
 * 0001_rls.sql explains it for `users`: Better Auth must look a user up BY EMAIL before a
 * session exists, so there is no `app.user_id` to scope by at the moment of sign-in. The
 * same is true of every table below -- a session is fetched by token, a verification by
 * identifier, a passkey by credential id, all before any principal is known. A policy
 * would break authentication outright.
 *
 * The mitigation is structural and unchanged: nothing outside `packages/core/auth`
 * touches these, and `biome.json` restricts the `better-auth` import to one file.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    // The opaque value in the cookie. Unique because it is the lookup key on every
    // authenticated request, so this index is the hottest one in the schema.
    token: text('token').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: tstz('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
)

/**
 * Present because half of Better Auth's core expects it, not because it is used.
 *
 * There is no password and no social provider: research/07-auth-and-tenancy.md rules
 * OAuth out (it would put an identity sub-processor on the DPA, undoing the EU-residency
 * argument for self-hosting). `password` therefore stays null on every row, and a
 * non-null value in this column means something has gone wrong.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    // Required as of 1.7.x. Absent from 1.6, which is what research/07 was written
    // against -- a concrete example of why the shapes are read rather than remembered.
    issuer: text('issuer').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: tstz('access_token_expires_at'),
    refreshTokenExpiresAt: tstz('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('accounts_user_id_idx').on(t.userId),
    uniqueIndex('accounts_provider_account_key').on(t.providerId, t.accountId),
  ],
)

/**
 * One-time secrets. **This is where the six-digit sign-in code lives** -- the `emailOTP`
 * plugin has no table of its own; `identifier` is the address and `value` is the code.
 *
 * So the retention question for auth is this table and nothing else, and rows here are
 * short-lived by construction (`AUTH_POLICY.codeTtlSeconds`). A cleanup job belongs with
 * M10's retention work rather than here.
 */
export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
)

/**
 * A registered authenticator. The primary credential; the email code is the floor
 * beneath it.
 *
 * **`credentialID` is scoped to one RP ID, and ours is `app.guestnote.be`, never
 * `guestnote.be`.** A passkey scoped to a registrable suffix is usable by every subdomain
 * beneath it, and PH4 serves per-tenant wedding sites on `<slug>.guestnote.be`. `rp.id` is
 * hashed into the authenticator at creation and can never be edited, so changing it later
 * invalidates every row in this table. The value is set in the auth config, and that is
 * the single most consequential line in it.
 *
 * `counter` is a clone-detection signal: if an assertion arrives with a counter lower than
 * the stored one, the authenticator may have been copied. The surface refuses it silently
 * and falls back to the code -- it must never say why on screen.
 */
export const passkeys = pgTable(
  'passkeys',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The user's own label for the device, shown in account settings. Not ours to invent.
    name: text('name'),
    publicKey: text('public_key').notNull(),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    // Whether the credential syncs through iCloud Keychain or a password manager. A
    // device-bound passkey that is NOT backed up is one lost phone away from the email
    // floor being the only way in, which is why the fallback can never be removed.
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    aaguid: text('aaguid'),
    createdAt: createdAt(),
  },
  (t) => [
    index('passkeys_user_id_idx').on(t.userId),
    uniqueIndex('passkeys_credential_id_key').on(t.credentialID),
  ],
)

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name'),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
