# S7 Templates — reusable checklists, copied onto a wedding

**Date:** 2026-09-21 · **Status:** Built 2026-09-22 · **Parent:** `docs/specs/0003-planner-app-screens.md`, row S7

Nothing here contradicts spec 0003. Two routes over `task_templates` and `template_items`. Applying goes
through S2's `createTasks` (`packages/db/src/repos/tasks.ts`), unchanged.

## Behaviour

**List, `/templates`** (`app.templates()`)
- One card per template: name, description, item count. A card opens the editor.
- `owner` and `admin` see "Nieuw sjabloon" (name, description). `member` reads and applies only.
- A user with no standing in the org gets a 404, not a 403.

**Editor, `/templates/[templateId]`** (`app.template(id)`)
- Head: name, description. Owner and admin get Edit, Duplicate, Delete (Delete asks once).
- Items table, in `position` order: order arrows, offset (`T-180` = 180 days before, `T+3` = after),
  title, owner (planner or couple), an "Alleen intern" pill for internal items, and **Becomes**: the date
  that offset gives for the wedding picked in the apply panel.
- Add an item in one row under the table (title, days, before or after, owner, shared or internal;
  Enter submits). Edit opens a side sheet with the same fields plus Remove. Up and down arrows reorder.
- Offsets follow S2's rule: 0 to 3650 days, before or after, whole numbers.
- **Apply to a wedding:** pick a wedding, press Apply. One task per item is created through
  `createTasks`, all or nothing. The answer names the count and links to that wedding's checklist.
- **Copy on apply.** Tasks keep no link to the template. Editing or deleting the template later
  changes no wedding. Applying twice adds the tasks twice, and the panel says so.
- A wedding with no date still receives the tasks: they keep their offset and get a date once the
  wedding has one (S2's rule). Its Becomes column shows "-".
- Duplicate copies the template and its items under "<name> (kopie)" and opens the copy.
- Delete is a soft delete. Applied weddings are untouched.

**Rules that are easy to get wrong**
- Writes are owner and admin only: the action checks, the repo takes `principalForOrg`, RLS is the third
  layer. A `member` reads through one assigned wedding, like S3's directory.
- Applying reads the template under the caller's principal (a template of another org is `notFound`) and
  lets `createTasks` decide whether the wedding is reachable. It never takes a wedding id on trust.
- Before an item is written, the repo reads the parent template in the same transaction (spec 0003,
  "Shared rules": foreign keys are plain).
- Item `position` is renumbered 0..n-1 on every move, so ties from any earlier write cannot make an
  arrow do nothing.
- `couple` and outside `editor` get a 404.

## States

| State | List | Editor |
|---|---|---|
| Empty | "Nog geen sjablonen"; owner and admin get the create button | "Dit sjabloon heeft nog geen taken", the add row still shown |
| One / many | cards | table |
| No weddings to apply to | n/a | apply panel says there is no wedding yet, button off |
| Wedding without a date | n/a | Becomes shows "-", note under the picker |
| Loading | `loading.tsx` | `loading.tsx` |
| Error | inline message in the form; list stays | inline message beside the control; table stays |
| Read-only (`member`) | no create button, note | no edit, add, reorder or delete; apply works |
| Compact density | cards and rows follow `--row-h` and `--control-h` | same |

## Copy

`app.s7.*` in `apps/web/messages/app/s7.{nl,en,fr}.json`. NL first. The heading reuses the sidebar word.

## Done

- [x] `packages/db/src/repos/templates.ts`: access, list, get, create, update, duplicate, delete, item
      add / update / delete / move, apply
- [x] Both `page.tsx` and `loading.tsx`, both `actions.ts`, client components in `components/templates/`
- [x] Message files in three languages, `messages.test.ts` green
- [x] Tests: access logic, input parsing, offset preview, both actions, components
- [x] Browser: many, apply, add item, reorder, read-only member, compact density

## Progress

- [x] Read spec, prototype range, S2 `createTasks`, S3 as the pattern
- [x] SPEC.md
- [x] Repo
- [x] Input parsing and preview helpers, with tests
- [x] Actions, with tests
- [x] Components and pages
- [x] Messages NL, EN, FR
- [x] Typecheck, biome, unit and component tests
- [x] Browser check
- [x] Commit
