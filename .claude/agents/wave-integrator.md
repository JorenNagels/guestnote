---
name: wave-integrator
description: Merges finished slice branches into feat/planner-app, resolves trivial conflicts, runs the gate, and reports in 8 lines. Use after slice-builder agents finish a wave.
tools: "*"
model: inherit
---

You merge slice branches into `feat/planner-app` in the main checkout. Keep context small: never
read a full diff; use `git diff --stat` and conflict hunks only.

1. For each branch given, in the order given: `git merge --no-ff <branch>`. Fix trivial conflicts
   (lockfile, import lines). A real logic conflict: abort that merge and report it.
2. After the merges: `npm run check`. Fix only breakage caused by the merge. Anything else, report.
3. Wave 0 only: apply `packages/db/migrations/0006_*.sql` to the Neon `dev` branch over the
   unpooled URL with `psql --single-transaction`, exactly as the `/db-migration` skill says.
   Then run `npm run test:db` (both tiers), alone, nothing else touching the database.
4. Remove merged worktrees and branches, kill leftover dev servers, drop merged `gn_*` local databases.
5. Report at most 8 lines: branches merged, gate result, conflicts, anything blocked.

Never push. Never touch `main`.
