import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Three projects, and the split is load-bearing.
//
//   unit       no external dependencies, runs on every save.
//   component  renders React into jsdom. No network, no database, no browser binary.
//   db         requires DATABASE_URL pointing at a Neon branch, and runs SERIALLY.
//
// The `db` project must not run in parallel. Its assertions are about
// transaction-scoped GUCs (`set_config('app.org_id', $1, true)`) behaving
// correctly through Neon's pooler; concurrent workers on a shared branch produce
// flaky results that look like isolation bugs and are not. The one test that DOES
// exercise concurrency does so inside a single test file, against a pool it caps
// itself -- see packages/db/test/pooling.test.ts.
//
// `vitest.workspace.ts` is gone in Vitest 4; `test.projects` replaces it.
export default defineConfig({
  // Both tsconfigs that own .tsx files set `jsx: "preserve"`, because Turbopack does the
  // real transform for the app and nothing compiles the packages at all. The transformer
  // reads that setting and honours it -- leaving JSX in the output, which is not
  // JavaScript and fails at import with a syntax error pointing at a `<`.
  //
  // Overriding it here is the whole fix, and it is why there is no `@vitejs/plugin-react`
  // in this repo: that plugin exists for Fast Refresh, which a test run does not have and
  // does not want, and it would pull Babel in behind it.
  //
  // The key is `oxc`, NOT `esbuild`. Vitest 4 is built on Vite 8, which transforms with
  // Rolldown/Oxc; `esbuild` still typechecks as a config key and is silently ignored,
  // which is the worst possible failure mode -- the symptom is identical to having set
  // nothing at all.
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'react',
      // `__source` on every element, so a failed query points at the line that rendered
      // the markup rather than at Testing Library's internals.
      development: true,
    },
  },

  resolve: {
    alias: {
      // See test/stubs/server-only.ts for why this is an alias and not a resolve
      // condition. Without it, `apps/web/src/proxy.ts` cannot be imported by a test.
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },

  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          // Co-located with the source they cover, and needing nothing external. The
          // split is by location rather than by an exclude list, so a new test cannot
          // land in the wrong project by accident: anything under `test/` needs a
          // database, anything beside the source does not.
          include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          environment: 'jsdom',
          setupFiles: ['./test/setup-dom.ts'],
          // `.tsx`, where `unit` takes `.ts`. The extension IS the selector, and the two
          // globs are disjoint -- picomatch does not let `*.test.ts` match `*.test.tsx`.
          //
          // It reads as a filing convention and is really a resource one: a file that
          // renders a component has to be .tsx to hold the JSX, so needing a DOM and
          // needing the extension arrive together. A test that imports React but asserts
          // no markup (say, on a hook's return value) is the one case where the two come
          // apart -- give it a .tsx extension anyway and it lands in the right project.
          include: ['packages/*/src/**/*.test.tsx', 'apps/*/src/**/*.test.tsx'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          include: ['packages/db/test/**/*.test.ts'],
          pool: 'forks',
          fileParallelism: false,
          maxWorkers: 1,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
