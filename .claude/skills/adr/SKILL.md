---
name: adr
description: Write an architecture decision record in this repo's house style, or decide whether a decision belongs in docs/adr/, in research/, or in a code comment. Use when a decision has just been settled by measuring something, when asked to document or record a decision, or when a research document turns out to have been wrong about how something actually behaves.
user-invocable: true
argument-hint: "[the decision, or the question that was just settled]"
---

# Writing an ADR in Guestnote

`docs/adr/` holds decisions that were **measured against something running**. That is the
distinction that earns a file here — the reasoning documents in `research/` argue from evidence
gathered outside the codebase, and the ADRs record what happened when the code met reality.
0003 puts it in words -- "measured rather than reasoned" -- and the other three earn the
folder the same way.

## Does this belong in an ADR?

| Where | What goes there |
|---|---|
| `docs/adr/NNNN-*.md` | A decision settled by running something. Records the number, the date, and where an earlier doc was wrong. |
| `research/NN-*.md` | The reasoning: options, prices, competitors, rejected alternatives with their reasons. Amended with dated correction notes, never silently. |
| a code comment | Why *this* line is the way it is, the alternative rejected, and the cost accepted. |
| `CLAUDE.md` | A rule that binds future work. |
| `README.md` | Product state, what is shipped, what is next. |

If nothing was measured and no option was killed, it is probably a code comment. If the answer
came from a price list, a competitor or a market, it belongs in `research/`. If a document that
already exists turns out to be wrong, the ADR is the right place — and it should say which
document, which section, and what it got wrong.

## The shape

Number sequentially from the highest in `docs/adr/` -- four exist as of 2026-08-19, so the
next is 0005, but check rather than trust that. Filename is
`NNNN-short-hyphenated-title.md`, all lowercase.

```markdown
# ADR NNNN — <the decision, as a claim rather than a topic>

**Date:** YYYY-MM-DD · **Status:** <Settled, verified | Accepted, and measured rather than reasoned | Domain done, X pending, deliberately>

<One or two sentences: what this records, and — if it applies — which earlier document it
corrects. ADR 0003 opens by naming "the four places where research/05-architecture.md turned
out to be wrong", and that framing is the point.>

## The question

<The uncertainty as it was actually posed, quoted from the document that raised it where
possible, with the section number. Then why it mattered: what rests on the answer.>

## The answer

**<Yes / No / the choice>.** <Verified against what, not reasoned about.>

- the environment: versions, region, endpoint, project id — whatever makes it reproducible
- the command that was run, and its result

| Assertion | Result |
|---|---|
| <the specific thing checked> | <what happened> |

## Why <the obvious objection> does not apply

<The documented limitation, the competing intuition, or the thing a reader will reach for.
Answer it directly. If it is the reason for the design rather than a problem with it, say so.>

## What this costs

<The accepted trade-off, stated plainly. Every ADR here has one.>

## What is still open

<Named, so it is not mistaken for settled.>
```

Not every section is mandatory — 0002 is structured as "what is set up" and "why the next step
was deliberately not taken", because that was the shape of the decision. Match the decision, not
the template.

## House style

- **A number or it did not happen.** "94 passed", "PostgreSQL 18.4", "measured 2026-08-18",
  "$37.96/mo NAT Gateway". A claim without a figure reads as an assumption here.
- **Say when you were wrong, and where.** Name the document and the section. The value of these
  files is that a reader who has just read `research/05-architecture.md` learns which parts of
  it to distrust.
- **State the cost of every choice.** `typedRoutes` is off and `src/lib/routes.ts` is the
  compensation; the standalone artefact lands one directory deeper than expected. Costs that are
  written down do not get rediscovered as bugs.
- **Leave the old name working.** `pro.` redirects to `app.` rather than dying, so old links and
  four documents' worth of references keep working. If a rename is part of the decision, say what
  keeps working and for how long.
- **Em dashes are fine in markdown.** In source comments use `--`, and in AWS resource names and
  descriptions use hyphens.
- Distinguish "we chose this number" from "we accepted the library default" — only one of those
  survives a security review unexamined, and `packages/core/src/auth/policy.ts` labels every
  value accordingly.

## After writing it

1. Add it to the ADR list wherever the affected area points at ADRs — `README.md`, the relevant
   package README, or the code comment that raised the question.
2. If it corrects a `research/` document, add a dated correction note **there** too, pointing at
   the ADR. Do not edit the original claim away: the record that it was once believed is part of
   why the decision is not re-litigated.
3. Update `CLAUDE.md` only if the decision creates a rule that binds future work.
