import { execFileSync } from 'node:child_process'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The three import bans, enforced as tests rather than only as lint rules.
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

  /**
   * Matches an IMPORT, not a mention.
   *
   * It used to be a bare name search, which meant any file that documented the ban --
   * naming the escape hatch in order to say "do not use this" -- was reported as an
   * offender. Two did, the moment `apps/web` became tracked and `git grep` could see it,
   * and both were comments. A guard that fires on prose is a guard that gets weakened.
   *
   * `from '...'` and `import('...')` are the only ways in, since the package has no
   * side-effect-only use.
   */
  //
  // `git grep -E` is POSIX ERE, where `\s` is NOT a valid escape -- an early version of
  // this pattern used it and matched nothing at all, which the probe below caught.
  // `[[:space:]]` is the portable spelling.
  const IMPORTS_UNSAFE =
    "(from|import\\()[[:space:]]*'@guestnote/db/unsafe'" +
    '|\\{[^}]*unsafeDbForMigrationsAndAdminOnly[^}]*\\}[[:space:]]*from'

  it('is imported only from packages/db', () => {
    const offenders = gitGrep(IMPORTS_UNSAFE).filter((f) => !ALLOWED.some((re) => re.test(f)))
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

  /**
   * The scoped packages, which the pattern above cannot see.
   *
   * An import of the scoped plugin does not contain the substring the assertion above greps
   * for -- the leading `@` breaks it -- so that check missed the plugin entirely, and
   * `@simplewebauthn`, which the plugin hoists, was in neither this file nor `biome.json`.
   * (Both patterns are written without a quoted example on purpose: a literal one in this
   * comment is itself a match, and would make this file its own offender.)
   * Both are **phantom dependencies**:
   * declared in no `package.json`, resolvable from `apps/web`, and `npm run check` passed on
   * a probe file importing them (measured 2026-08-31, during the passkey sign-in review).
   *
   * That mattered the moment sign-in landed. `passkey.ts` hand-rolls base64url in two
   * directions specifically to avoid `@simplewebauthn/browser`'s
   * `parseRequestOptionsFromJSON`, and until this test existed a comment was the only thing
   * stopping the next person undoing that.
   */
  it('is imported only there under its scoped names either, plugin and WebAuthn library', () => {
    const offenders = gitGrep("from '(@better-auth/[^']*|@simplewebauthn/[^']*)'").filter(
      (f) => !ALLOWED.some((re) => re.test(f)),
    )
    expect(
      offenders,
      'These files import a scoped provider package directly. The WebAuthn ceremony types ' +
        'are hand-written in packages/core/src/auth/types.ts on purpose -- see the comment ' +
        'on PasskeyCreationOptions:\n  ' +
        offenders.join('\n  '),
    ).toEqual([])
  })

  /**
   * The canary this file already runs for `@guestnote/db/unsafe`, applied to the pattern
   * above: a regex that matches nothing passes forever, and would have passed for the whole
   * eleven days the scoped ban did not exist.
   */
  it('has a pattern that actually matches the one legitimate importer', () => {
    const found = gitGrep("from '(@better-auth/[^']*|@simplewebauthn/[^']*)'")
    expect(
      found,
      'The scoped-import pattern matched nothing at all, so the assertion above proves ' +
        'nothing. better-auth.ts imports @better-auth/passkey and should be found here.',
    ).toContain('packages/core/src/auth/better-auth.ts')
  })
})

describe('the AWS SES SDK stays behind the packages/email seam', () => {
  /**
   * Two reasons this one is worth a test and not only a lint rule, and the second is the
   * unusual one:
   *
   *   1. The seam argument, same as better-auth above. research/05-architecture.md section 6
   *      chose SES on price and EU residency, and swapping should be one new file in
   *      packages/email rather than a search across the codebase.
   *   2. **Bundle size.** `@aws-sdk/client-sesv2` is ~1.9 MB unpacked, and apps/web builds with
   *      `output: 'standalone'` plus `outputFileTracingRoot`, which traces FILES rather than
   *      tree-shaken imports. A single stray `import { SESv2Client } from ...` in a Client
   *      Component or a shared util drags the whole SDK into the Lambda bundle, and nothing
   *      about that failure is visible until a deploy.
   *
   * `ses.test.ts` is the second allowed path: `classify()` maps the SDK's own exception classes
   * with `instanceof`, which cannot be tested without constructing them, and a test file cannot
   * reach a production bundle.
   */
  const ALLOWED = [/^packages\/email\/src\/ses\.ts$/, /^packages\/email\/src\/ses\.test\.ts$/]

  /**
   * The parentheses are load-bearing, and the reason is the lesson this file already records
   * above: "a guard that fires on prose is a guard that gets weakened."
   *
   * Written as the bare literal, this pattern matched THIS FILE -- the pattern string is itself
   * the text it searches for, so the ban reported itself as an offender on the first run. The
   * group makes the file's own copy read `from '(@aws-...` while a real import still reads
   * `from '@aws-...`, so the search no longer finds its own definition. The better-auth ban
   * above has the same shape for the same reason.
   */
  const IMPORTS_SES = "from '(@aws-sdk/client-sesv2)'"

  it('is imported only by packages/email/src/ses.ts and its test', () => {
    const offenders = gitGrep(IMPORTS_SES).filter((f) => !ALLOWED.some((re) => re.test(f)))
    expect(
      offenders,
      'These files import the SES SDK directly. Go through createMailer() / ' +
        'createSesTransport() in @guestnote/email instead:\n  ' +
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
    // Deliberately the bare name, not IMPORTS_UNSAFE: this asserts the mechanism works
    // at all -- cwd, glob, exit-code handling -- and must not depend on the narrower
    // pattern the ban uses, or a broken ban would take its own canary down with it.
    const hits = gitGrep('unsafeDbForMigrationsAndAdminOnly')
    expect(
      hits.length,
      'git grep found no reference to unsafeDbForMigrationsAndAdminOnly at all, so the ' +
        'bans above are vacuous -- the pattern, the file glob or the cwd is wrong.',
    ).toBeGreaterThan(0)
  })
})
