import { defineConfig } from 'drizzle-kit'

/**
 * `drizzle-kit generate` needs no database connection, which is why the schema and
 * its migration can be reviewed before any Neon project exists.
 *
 * `migrate` uses DATABASE_URL_UNPOOLED -- the direct endpoint, not the `-pooler`
 * host. DDL through a transaction-mode pooler is a bad time, and migrations are the
 * one workload with no reason to go through it.
 *
 * Policies, roles and grants are NOT managed from the Drizzle schema; they live in
 * hand-written SQL alongside the generated migrations. research/05-architecture.md
 * section 4 wants `CREATE POLICY` readable in a plain `.sql` file, and keeping
 * drizzle-kit out of the RLS business means it can never generate a diff that
 * quietly drops a policy.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? '',
  },
  strict: true,
  verbose: true,
})
