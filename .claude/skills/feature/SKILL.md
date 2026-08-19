---
name: feature
description: Interrogate a feature into a written spec before any planning or any code — a full pass of questions, a spec file in docs/specs/, then plan mode. Use whenever a feature or a next piece of work has been chosen and is about to be built, and BEFORE reaching for EnterPlanMode or writing anything. Also when asked to spec, scope or nail down a feature.
user-invocable: true
argument-hint: "[the feature, e.g. 'the task engine']"
---

# /feature — from "let's build X" to a plan

Four steps, in order: **scout, interrogate, write, plan.** No plan and no code until the spec
file exists and the user has answered every question that changes what gets built.

The reason this skill exists: a plan assembled from inferred requirements produces a feature
that is technically correct and wrong, and the wrongness only surfaces once it is built. This
repo already refuses to let a decision be undone silently — every comment carries its rejected
alternative, `research/` keeps dead options on purpose, ADRs name the document they correct.
A feature built from assumptions is a whole set of decisions made silently. This closes that
hole at the only point where it is cheap.

**What it costs:** a full round of your attention before a line of code, and a file that has to
be amended whenever the build diverges from it. Step 0's exits are the compensation. The
lighter alternative — three quick questions and straight into planning — was rejected because a
thin spec is one you re-interrogate in plan mode anyway, which is the same cost paid later and
with worse information.

## Step 0 — Does this apply?

**Yes** when a specific feature has been named or agreed and the next move is to build it.
"Let's do the task engine", "build the invite flow", "start on the budget".

**No** for a one-line fix, a bug, a refactor with no user-visible behaviour change, a
documentation pass, or pure research. Those go straight to the work.

**Also no** when the user says "just build it", "skip the questions" or similar. Say in one
line that you are skipping the interrogation, and go.

## Step 1 — Scout, before asking anything

Run the **`spec-scout`** agent on the named feature. It returns three lists: what the repo has
**already settled** (with `file:line` citations), what is genuinely **open**, and the **traps** a
comment says to avoid here.

Never skip it. Asking the user something `packages/db/src/schema/tasks.ts` already answers
spends their attention on a decision they made months ago — and worse, invites an answer that
contradicts a migration that has already run.

## Step 2 — Interrogate

**Open with the settled list**, compact, one line each with its citation, framed as a veto:
*"the repo already decided these — say the word to override any of them."* Then ask about the
rest.

### Coverage

Work this table rather than what comes to mind. The point is *every* detail, and the details
that get skipped are always from the same rows.

| Dimension | What to settle |
|---|---|
| **The job** | What the planner is doing when they open this, and what it replaces in the spreadsheet |
| **Surface** | Which host, which route, new screen or a section of an existing one |
| **Data** | Which tables, which new columns, which are nullable and why |
| **Tenancy** | Who reads and who writes, per role. The roles that **exist** are `org_members` owner/admin/member plus `wedding_members` couple/editor — from `packages/db/src/schema/orgs.ts` and `weddings.ts`, not from `09-planner-app.md` §d, whose table is a proposal and names a `vendor` that the schema defers |
| **Writes** | Which Server Functions, what each validates, what it returns on failure |
| **States** | Empty · one row · three hundred rows · loading · error · printed on paper with no signal |
| **Copy** | Every user-visible string. NL is the primary market language — write it first |
| **Density & phone** | Whether it must hold at `[data-density="compact"]` and on a phone at a venue |
| **Not in scope** | Named exclusions, and which phase each belongs to |
| **Done** | What must be true before this is finished |

### Form

Multiple-choice through `AskUserQuestion` **where a real option set exists** — recommendation
first and labelled `(Recommended)`, with the trade-off in the description. Prose questions in
chat where the answer is genuinely the user's to write.

Batch **four at a time — that is `AskUserQuestion`'s per-call maximum, not a style choice**, so
more than four in one message is not available. Go under it deliberately when one answer would
change how the next question should be phrased.

Use a `preview` on an option when the choice is a layout, a file arrangement, a copy variant or
a schema shape. Seeing the two side by side settles in a second what a paragraph argues about.

### Rules

- **Never ask what the settled list answers.** That list exists to shorten this one.
- **One recommendation per question, first, with its reason.** Four equal options is the work
  handed back to the user.
- **Ask about failure and empty states explicitly.** They are what gets skipped in the asking
  and rebuilt after the demo.
- **Ask what is *not* in scope.** One named exclusion is worth three inclusions, because it is
  the one that stops the build growing.
- **Follow up.** The list is not fixed at the start; an answer that opens a new question earns
  that question.
- **Stop when another question would not change what gets built**, and say that you have
  stopped rather than trailing off.

## Step 3 — Write the spec

`docs/specs/NNNN-short-hyphenated-title.md`, numbered sequentially from the highest already
there — check, do not trust a memory of the count. The folder held only its README as of
2026-08-19, so the first spec is `0001`, matching `docs/adr/` rather than the `0000` that
`packages/db/migrations/` starts from. `docs/specs/README.md` states the conventions.

```markdown
# Spec NNNN — <the feature, written as what it lets someone do>

**Date:** YYYY-MM-DD · **Status:** Specified, not built
**Phase:** <e.g. PH0 P3 + PH1 P6, per research/09-planner-app.md> · **Bar:** <the sentence this moves toward>

<Two sentences: what this is, and what it replaces in the spreadsheet.>

## Already settled elsewhere

<The scouted list, as accepted or amended by the user. Recording it here is what stops the
same ground being re-covered by the next spec.>

| Decision | Where it was already made |
|---|---|

## Decisions taken here

<Every answer from the interrogation, as a claim rather than a topic. Where an option was
rejected, name it and why: the repo's rule that a rejected option is never deleted applies
to specs too.>

### <topic>

**<the decision>.** <Why. What it rejected. What that costs.>

## Behaviour

<Screen by screen, state by state. Empty · one · many · loading · error · printed.>

## Data

<Tables and columns touched. Each new column with its nullability and the reason for it.>

## Permissions

| | owner | admin | member | editor | couple |
|---|---|---|---|---|---|

<`editor` is a real `wedding_members` role and RLS discriminates on it
(`packages/db/migrations/0001_rls.sql`). No `vendor` column: deferred, and
`packages/db/src/schema/weddings.ts` says why.>

## Copy

<Every user-visible string, NL first. The keys these land under in apps/web/messages/.>

## Not in scope

| Not building now | Why, or which phase it belongs to |
|---|---|

## Done means

<A checklist someone can actually tick, ending in the verification rungs this needs — ask
/verify which those are rather than guessing.>

## Still open

<Named, so it is not mistaken for settled.>
```

Not every section is mandatory. Match the feature: a spec for a read-only screen has no
`Writes`, and saying so beats an empty heading.

## Step 4 — Plan mode

Summarise the spec in a few lines, give its path, then call **`EnterPlanMode`** immediately.
Its own approval prompt is the checkpoint — do not add a second one by asking whether the spec
is good first. What that trades: the spec lands on disk unreviewed as a whole, every line of it
having come from an answer the user gave. It gets read in the commit diff instead of in a
prompt, which is the better place to read a document anyway.

Then **plan from the file, not from the conversation.** Re-read it. The plan's job is
sequencing, file paths and verification; every behavioural question is answered already. If the
plan turns out to need an answer the spec does not hold, that is a question that was missed —
go back and ask it, amend the spec, and carry on.

## After the build

1. **If the build diverged, amend the spec.** A spec describing a product that does not exist is
   the defect `doc-steward` is built to catch, and it is worse than no spec.
2. **Commit it with the feature**, and set `**Status:** Built YYYY-MM-DD`.
3. **If a question got settled by measuring something running, that is also an ADR** — `/adr`.
   The spec says what was decided; the ADR says what was measured.
