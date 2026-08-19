import { Pool } from 'pg'

/**
 * Empties every table on the development branch.
 *
 *   npm run db:reset -- --yes
 *
 * ## Why this is a script and not a line in the seed
 *
 * `seed-dev.ts` runs as `app_user` and satisfies the policies, which is the interesting
 * thing about it. Truncation cannot: `0001_rls.sql` sets FORCE ROW LEVEL SECURITY, so even
 * the table owner is bound by its own policies, and no single tenant context may delete
 * another tenant's rows. So this needs SEED_DATABASE_URL -- the direct, BYPASSRLS
 * connection -- and keeping it in its own file is what stops the seed from quietly
 * acquiring a privileged handle it does not need.
 *
 * It is also the reason the two are separate commands. Wiping a database should be
 * something you typed, not something that happened on the way to something else.
 *
 * ## The table list is discovered, not written down
 *
 * `packages/db/test/harness.ts` truncates a hardcoded list, and that list has already
 * fallen behind: `mail_deliveries` and `rate_limits` both survive it, because they were
 * added after it was written. Reading `pg_tables` instead means a table added tomorrow is
 * covered tomorrow, with nothing to remember.
 *
 * ## Node-postgres, not the Neon driver
 *
 * `createPool` in `src/client.ts` is the WebSocket/pooled driver, and DDL-ish work has no
 * reason to go through a transaction-mode pooler -- the same argument `drizzle.config.ts`
 * makes for running migrations against the direct endpoint.
 */

const PROTECTED = /^__drizzle/

async function main(): Promise<void> {
  if (!process.argv.includes('--yes')) {
    throw new Error(
      'Refusing to run without --yes.\n' +
        '  npm run db:reset -- --yes\n' +
        'This empties EVERY table on whatever SEED_DATABASE_URL points at, including ' +
        'users, sessions and mail_deliveries. There is no undo.',
    )
  }

  const connectionString = process.env.SEED_DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'SEED_DATABASE_URL is not set. It must be the DIRECT (non -pooler) url for a role ' +
        'that can bypass RLS -- neondb_owner on Neon, postgres locally. app_user cannot ' +
        'truncate across tenants, which is the whole point of the policies.',
    )
  }

  const pool = new Pool({ connectionString, max: 1 })
  try {
    const { rows } = await pool.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' order by tablename`,
    )
    const tables = rows.map((r) => r.tablename).filter((t) => !PROTECTED.test(t))
    if (tables.length === 0) {
      console.info('  Nothing to do: no tables in the public schema.')
      return
    }

    // Counted before, so the output says what was actually destroyed rather than
    // "done". A reset that silently hit an already-empty database and one that wiped a
    // afternoon's work look identical otherwise.
    let total = 0
    for (const table of tables) {
      const { rows: c } = await pool.query<{ n: number }>(
        `select count(*)::int as n from "${table}"`,
      )
      const n = c[0]?.n ?? 0
      total += n
      if (n > 0) console.info(`  ${String(n).padStart(5)}  ${table}`)
    }

    // One statement for all of them. CASCADE is not optional here -- the tables carry
    // foreign keys in both directions and truncating them one at a time would need an
    // ordering that is another list to keep current.
    await pool.query(`truncate table ${tables.map((t) => `"${t}"`).join(', ')} cascade`)

    console.info(`\n  Reset: ${total} rows across ${tables.length} tables.\n`)
  } finally {
    await pool.end()
  }
}

await main()
