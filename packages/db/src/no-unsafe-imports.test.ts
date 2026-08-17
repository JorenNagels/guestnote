import { execFileSync } from 'node:child_process'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The two import bans, enforced as tests rather than only as lint rules.
 *
 * Both exist in biome.json as well. The duplication is deliberate:
 *
 *   - A lint rule can be silenced with an inline `biome-ignore` comment. A test cannot.
 *     For a rule whose violation is a cross-tenant data leak, that difference matters
 *     more than the duplication costs.
 *   - It makes the choice of linter reversible. Swapping Biome for something else is
 *     then a formatting decision, not a security decision.
 *
 * Uses `git grep` so it only ever sees tracked files -- no node_modules, no build
 * output, no false positive from a stray file in a scratch directory.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..')

function gitGrep(pattern: string): string[] {
  try {
    const out = execFileSync('git', ['grep', '-l', '-E', pattern, '--', '*.ts', '*.tsx'], {
      cwd: REPO,
      encoding: 'utf8',
    })
    return out
      .split('\n')
      .filter(Boolean)
      .map((p) => relative('.', p))
  } catch (err) {
    // git grep exits 1 when there are no matches, which is the good case here.
    if ((err as { status?: number }).status === 1) return []
    throw err
  }
}

describe('@guestnote/db/unsafe stays contained', () => {
  /**
   * `unsafeDbForMigrationsAndAdminOnly` returns a handle with no tenant scoping. It
   * exists because migrations and genuine create-a-tenant operations need one -- signup
   * cannot run under an org context, because there is no org yet.
   *
   * Everywhere else it is a cross-tenant leak waiting to happen.
   * research/05-architecture.md section 4.
   */
  const ALLOWED = [/^packages\/db\//]

  it('is imported only from packages/db', () => {
    const offenders = gitGrep('@guestnote/db/unsafe|unsafeDbForMigrationsAndAdminOnly').filter(
      (f) => !ALLOWED.some((re) => re.test(f)),
    )
    expect(
      offenders,
      'These files import the unscoped database handle. Use withTenant() instead, or ' +
        'extend ALLOWED here with a comment explaining why this path genuinely cannot ' +
        'be tenant-scoped:\n  ' +
        offenders.join('\n  '),
    ).toEqual([])
  })
})

describe('better-auth stays behind the packages/core/auth seam', () => {
  /**
   * research/07-auth-and-tenancy.md section 1: the seam is what keeps a provider swap a
   * bounded one-weekend job instead of a rewrite. It only holds if exactly one file
   * imports the library.
   */
  const ALLOWED = [/^packages\/core\/src\/auth\/better-auth\.ts$/]

  it('is imported only by packages/core/src/auth/better-auth.ts', () => {
    const offenders = gitGrep("from '(better-auth|better-auth/.*)'").filter(
      (f) => !ALLOWED.some((re) => re.test(f)),
    )
    expect(
      offenders,
      'These files import better-auth directly. Go through getSession() / ' +
        'requireOrgMember() / requireWeddingAccess() in packages/core/auth instead:\n  ' +
        offenders.join('\n  '),
    ).toEqual([])
  })
})

describe('the ban is actually detectable', () => {
  /**
   * A grep-based test that silently matches nothing passes forever, including on the day
   * the pattern breaks. This proves the mechanism still finds what it is looking for by
   * searching for a string that definitely exists.
   */
  it('git grep finds a string that is known to be present', () => {
    const hits = gitGrep('unsafeDbForMigrationsAndAdminOnly')
    expect(
      hits.length,
      'git grep found no reference to unsafeDbForMigrationsAndAdminOnly at all, so the ' +
        'bans above are vacuous -- the pattern, the file glob or the cwd is wrong.',
    ).toBeGreaterThan(0)
  })
})
