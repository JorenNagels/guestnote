# Feature specs

What a feature must do, settled by asking **before** it is built. Written by the `/feature`
skill: a round of questions, then this file, then plan mode.

This folder exists because the rest of the repo's documentation is all backward-looking.
`research/` argues what to build from evidence gathered outside the codebase, `docs/adr/`
records what happened when a decision met something running, and a code comment explains a line
that already exists. None of them holds the requirements of a thing that does not exist yet —
so those were being inferred at planning time, silently, and discovered wrong once built.

| | `docs/specs/` | `docs/adr/` |
|---|---|---|
| Direction | forward — what a feature must do | backward — what happened when it ran |
| Earned by | asking, before the build | measuring, after it |
| Authority | intent. **The schema beats it** | measured fact. Supersedes `research/` |
| When it changes | amended when the build diverges | never rewritten; a later ADR corrects it |

## Conventions

- **Numbered from `0001`**, matching `docs/adr/` — not the `0000` of
  `packages/db/migrations/`. Filename `NNNN-short-hyphenated-title.md`, all lowercase.
- Opens with `**Date:** … · **Status:** …`, same as an ADR. Status runs
  `Specified, not built` → `Built YYYY-MM-DD` → `Superseded by NNNN`.
- **A partly-built spec keeps the `Specified, not built` status and says what exists in a
  `**Built so far:**` line underneath.** Spec `0001` shipped across three commits and found
  this gap on the first one. A fourth status term was the alternative and was rejected:
  "partly built" is not a state anyone can act on, whereas a line naming the built pieces
  is. `Built YYYY-MM-DD` means the whole spec is real.
- **An umbrella spec may hand each slice a `SPEC.md` beside its code.** The umbrella holds the
  shared decisions and data; the slice file holds behaviour, copy and done for that slice, and
  may not contradict the umbrella. First used by `0003`.
- **A rejected option is never deleted**, the same rule `research/` runs on. The spec records
  what was chosen *and* what was turned down, so the question is not reopened from scratch.
- **A spec that no longer describes the product gets amended, not left standing.** One that
  lies is worse than none, because it will be trusted. `doc-steward` treats it as a defect.

The schema in `packages/db/src/schema/*.ts` outranks anything written here. Where a spec and
the shipped schema disagree, the schema is what exists and the spec is what was wanted — the
gap is the finding, and the spec is the file that changes.
