import { defineConfig } from 'vitest/config'

// Two projects, and the split is load-bearing.
//
//   unit  no external dependencies, runs on every save.
//   db    requires DATABASE_URL pointing at a Neon branch, and runs SERIALLY.
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
