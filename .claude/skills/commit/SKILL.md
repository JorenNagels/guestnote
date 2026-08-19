---
name: commit
description: Review the pending work with a panel of specialist reviewers, then commit it in this repo's house style. Use when the user runs /commit, or asks to commit, review-and-commit, or "is this ready to commit". Scales the panel to what the diff touches, runs the gate first, drafts the commit message, and waits for a go-ahead before writing anything to git history.
user-invocable: true
argument-hint: "[--quick | --full] [subject hint]"
---

# /commit

Four steps, in order: **the gate, the panel, the triage, the message.** The commit itself
happens last and only after the user says go.

`--quick` skips the panel entirely (use for a formatting-only or lockfile-only change).
`--full` runs every reviewer regardless of what the diff touches. Any other argument is a hint
for the subject line.

## 1. The gate

There is no point reviewing a red tree, and a reviewer reading a diff that does not compile
will report noise.

```bash
git status --porcelain
git diff --stat
git diff --cached --stat
npm run check
```

If `npm run check` fails, **stop**. Report the failure and fix it, or hand it back. Do not
start the panel.

If the diff touches `packages/db/**` or a migration, `npm run test:db` is also part of the gate
— see the `verify` skill for the two-tier procedure. If the Neon environment is absent, say so;
do not commit a schema change while calling the isolation claim verified.

Also look at *what* is about to be committed, not just whether it passes:

```bash
git status --porcelain=v1 --untracked-files=all
```

Untracked files are the usual source of a bad commit. A new source file that belongs with the
work must be added; `.env*`, `apps/web/.mail/`, `cdk.out/`, `coverage/`, `og.png` and anything
`*.local` must not. `.gitignore` covers these, but check rather than assume — `.claude/agents/`
and `.claude/skills/` are deliberate exceptions to `.claude/*` and *should* be committed.

## 2. The panel

Pick reviewers from what the diff touches. **Launch them all in a single message so they run
concurrently.** Give each one the same scope statement — which paths, staged or unstaged, and
whether there are branch commits to include.

| The diff touches | Reviewer |
|---|---|
| any source file | `correctness-reviewer` |
| any source file | `test-critic` |
| any source file | `rationale-reviewer` |
| `packages/db/**`, a migration, `packages/core/src/auth/**`, `packages/email/src/ses.ts`, `proxy.ts`, `env.ts`, any `actions.ts`, any new query | `tenancy-auditor` |
| `*.md`, `CLAUDE.md`, `research/`, `docs/adr/`, or a decision that changed | `doc-steward` |
| only markdown or config | `doc-steward` alone |
| only formatting, or only `package-lock.json` | none — say so and go to step 4 |

**`mutation-tester` is deliberately not in the panel.** It edits source and restores with
`git checkout --`, which cannot tell its own mutation from the user's uncommitted work, so it
refuses to run on a dirty tree. Run it *after* the commit, on the files `test-critic` names as
priorities. Say that in your report rather than skipping it silently.

Tell `doc-steward` to report only for this commit and **not to edit** during a commit review —
a reviewer changing files mid-review makes the diff you are about to commit different from the
diff that was reviewed.

## 3. Triage

The panel's raw output is not the report. Do the work of reading it:

- **Drop what the code already answers.** This codebase documents deliberate exceptions,
  measured behaviour and branches that are unreachable on purpose. A finding the comment beside
  it already addresses is not a finding — check before passing it on.
- **Deduplicate.** Two reviewers reaching the same line from different angles is one finding
  with two lenses, and worth saying so; it is stronger evidence, not two problems.
- **Rank by consequence.** A cross-tenant leak, then a bug with a failure scenario, then a
  comment the diff has made false, then missing coverage, then everything else.
- **Separate blocking from noting.** Blocking: anything that leaks data, breaks an invariant in
  `CLAUDE.md`, or is a bug with a concrete failure scenario. Noting: everything a follow-up
  commit can carry.
- **Do not launder a guess.** If a reviewer could not name a failure scenario, present it as a
  suspicion, in those words.

Present the triaged list to the user before the message. Keep it short — file:line, one line
each, blocking first. If the panel found nothing, say which lenses ran and found nothing;
that is a result, not an absence.

## 4. The message

House style, from the history rather than from a convention:

```
area: lowercase claim, often with a contrast -- X rather than Y

Paragraphs of prose that argue the change. What the problem was, what was chosen, what was
rejected and why, what it costs. Numbers and dates where something was measured. Traps found
on the way, recorded so the next person does not rediscover them. `--` and not an em dash.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

- Subject: an `area:` prefix (`db:`, `web:`, `auth:`, `tests:`, `repo:`, `SES:`) or none at all
  where the claim reads better alone. Lowercase after the colon. State a **claim**, not a topic
  — "make Node 24 the default here, and a mismatch an error", not "update node config".
  No conventional-commits types, no scopes in parentheses, no trailing period.
- Body: prose paragraphs. **Not a bullet list of changed files** — the diff already says what
  changed; the message says why, and what was considered and rejected. Look at
  `git log -1 --format=%B 05e2596` for the calibration; long is normal here.
- Record what was measured, with the number and the date. Record what is deliberately *not*
  done, so it does not read as an oversight.
- End with the `Co-Authored-By` trailer above, exactly as written.

Draft it, show it to the user with the triaged findings, and **stop there.** Committing is the
user's call, not yours.

## 5. Committing, once they say go

```bash
git add <explicit paths>            # never `git add -A` without listing what it will take
git status --short                  # confirm exactly what is staged
git commit -F <message file>        # a heredoc mangles the blank lines and the trailer
git log -1 --stat
```

Every commit in this repo's history is a direct commit on `main`, which is deliberate for a
solo project — so stay on `main` unless the user asks for a branch. Never `push`, never
`--amend` a commit you did not just create in this session, never `rebase`, and never
`git checkout`/`restore` a file the user has edited.

If findings were left unfixed, say which ones went into the commit anyway, in one line. A
commit that carries a known issue is fine; a commit that quietly buries one is not.

## After

Name the two follow-ups worth doing now that the tree is clean:

1. `mutation-tester` on the files `test-critic` flagged — the check the panel structurally
   cannot run.
2. Anything the panel put in "noting", so it does not evaporate.
