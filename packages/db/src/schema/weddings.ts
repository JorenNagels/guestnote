import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { createdAt, deletedAt, oneOf, orgId, tstz, updatedAt, weddingId } from './_shared.ts'
import { users } from './auth.ts'
import { organizations } from './orgs.ts'

export const WEDDING_STATUSES = ['draft', 'live', 'archived'] as const

/**
 * `vendor` is deliberately absent. research/09-planner-app.md section a adds it, but
 * that document's own Open section has not decided whether vendors get accounts at
 * all or a signed link like guests -- in which case `vendor` is not a
 * `wedding_members` role. Because this is `text` + `CHECK` rather than a Postgres
 * enum, adding it later is a one-line ALTER. Encoding an undecided model now is the
 * more expensive mistake.
 */
export const WEDDING_ROLES = ['couple', 'editor'] as const

export const weddings = pgTable(
  'weddings',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId().references(() => organizations.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    status: text('status').notNull().default('draft'),
    coupleDisplayName: text('couple_display_name').notNull(),
    coupleNames: text('couple_names').array(),
    /**
     * A `date`, not a `timestamptz`, and that is not an oversight. A wedding date is
     * a local civil date -- "31 July 2027" is the same date to the couple whether
     * they are in Brussels or Bali. Pairing it with `timezone` is what lets
     * `tasks.due_offset_days` resolve "6 months before" to a real instant.
     */
    weddingDate: date('wedding_date'),
    /**
     * Spec 0003. Three plain columns, all nullable, so a wedding row created before the
     * planner app existed is still valid. `venue` is free text: the venue as a *directory
     * entry* is a `vendors` row, and a wedding may name a place nobody has entered there.
     *
     * `notes` is the planner's own, and this table's policy is the couple-readable one --
     * the `tenant_isolation` policy on `weddings` admits a `couple` principal to its own
     * wedding row, whole. So `notes` is readable by a couple the day a couple can reach this
     * table at all. Nothing can today (spec 0003: no screen is open to `couple`), and the
     * couple-portal spec must decide between a column-level answer and a separate table
     * before it lands. Recorded here, not fixed here, because 0006 must not change who can
     * read `weddings`.
     */
    venue: text('venue'),
    headcount: integer('headcount'),
    notes: text('notes'),
    /**
     * `#RRGGBB`, upper-case, or null. The server upper-cases before writing; the CHECK is
     * what makes a lower-case or 3-digit value a write error instead of a stored surprise.
     * A dot or a stripe, never text and never a background behind text (spec 0003) -- with one
     * exception, the viewer's own run-sheet rows, where it is mixed 12% into `--card`, a ceiling
     * chosen so text contrast holds for any hex (spec 0004, `run-sheet-view.tsx`).
     */
    color: text('color'),
    timezone: text('timezone').notNull().default('Europe/Brussels'),
    localeDefault: text('locale_default').notNull().default('nl'),
    locales: text('locales').array().notNull().default(sql`array['nl']`),
    theme: jsonb('theme'),
    publishedAt: tstz('published_at'),
    retentionDeleteAfter: date('retention_delete_after'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    check('weddings_status_check', oneOf('status', WEDDING_STATUSES)),
    check('weddings_headcount_check', sql.raw('headcount >= 0')),
    check('weddings_color_check', sql.raw("color ~ '^#[0-9A-F]{6}$'")),
    // The slug becomes a subdomain -- <slug>.guestnote.be -- so it is globally
    // unique, not unique per org. Reserved words are enforced in the repository
    // layer, where a useful error message can be produced.
    uniqueIndex('weddings_slug_key').on(t.slug).where(sql`deleted_at is null`),
    index('weddings_org_id_idx').on(t.orgId),
  ],
)

/**
 * THE COUPLE (plus staff assigned to this specific wedding).
 *
 * The second of the two tables without `wedding_id` as a separate tenant column --
 * here the wedding IS the scope -- and the second scoped ONLY by `app.user_id`.
 * research/07-auth-and-tenancy.md section 4a. (Migration 0005 gave `organizations` a
 * second policy on that same axis; these two remain the only tables with nothing else.)
 *
 * `role` does double duty: `couple` for the clients, `editor` for the staff member
 * assigned to that wedding. That is how "org member = assigned weddings only" is
 * actually implemented, since neither Better Auth nor any vendor can express
 * "member of Studio Wit, but only for wedding #7".
 */
export const weddingMembers = pgTable(
  'wedding_members',
  {
    weddingId: weddingId().references(() => weddings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.weddingId, t.userId] }),
    check('wedding_members_role_check', oneOf('role', WEDDING_ROLES)),
    index('wedding_members_user_id_idx').on(t.userId),
  ],
)

export const DOMAIN_KINDS = ['subdomain', 'custom'] as const

/**
 * Unused, on purpose, and worth its keep anyway.
 *
 * research/05-architecture.md section 3 is explicit that retrofitting host
 * resolution later costs a migration plus a rewrite of every canonical-URL and
 * email-link generator. So the table exists from the first migration and
 * `proxy.ts` ships all four host branches with `custom` returning 404. Custom
 * domains themselves are v2, via CloudFront SaaS Manager.
 */
export const weddingDomains = pgTable(
  'wedding_domains',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId(),
    weddingId: weddingId().references(() => weddings.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull().unique(),
    kind: text('kind').notNull().default('subdomain'),
    cfTenantId: text('cf_tenant_id'),
    certStatus: text('cert_status'),
    verifiedAt: tstz('verified_at'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    check('wedding_domains_kind_check', oneOf('kind', DOMAIN_KINDS)),
    index('wedding_domains_wedding_id_idx').on(t.orgId, t.weddingId),
  ],
)
