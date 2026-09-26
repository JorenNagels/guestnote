import type { AbstractIntlMessages } from 'next-intl'
import type { Locale } from '../lib/locales.ts'

/**
 * One catalogue per locale, assembled from the base file plus one file per planner-app slice.
 *
 * ## Why the slices are separate files
 *
 * Spec 0003 builds ten screens in parallel worktrees. If every slice appended to
 * `messages/nl.json` the merge would conflict on every one of them -- the same three files,
 * the same `app` object -- and a conflict resolved by hand in a JSON file is how a key goes
 * missing from one locale. So each slice owns `messages/app/<slice>.<locale>.json` and this
 * file merges it under `app.<slice>`. Rejected: discovering the files with a glob. It would
 * make "which files does the app actually load" a property of the file system rather than of
 * a list, and a stray or half-written file would then be shipped by accident. The cost of the
 * list is one line per slice, and the test below fails if it is forgotten.
 *
 * ## Adding a file

The file is named after the feature it holds copy for (`money`, `runSheet`), never after the
build slice that introduced it: a slice number means nothing once the spec is closed.

## Adding a slice
 *
 * Add its id to `SLICES` and create the three files. `i18n/messages.test.ts` fails when a file
 * exists that is not listed here (it would be silently unmerged: every key renders as its
 * path) and when a listed slice is missing a locale.
 *
 * ## Who reads this
 *
 * `i18n/request.ts` for every dashboard and marketing render. NOT `lib/mailer.ts`, which
 * imports the three base files directly for the `email` section alone -- that section stays in
 * the base files, and a slice must not put mail copy under `app.<slice>`.
 */
export const SLICES = [
  'shell',
  'weddingPages',
  'tasks',
  'vendors',
  'money',
  'files',
  'team',
  'templates',
  'today',
  'runSheet',
  'vendorLink',
  'banners',
  'report',
  'signup',
  'studio',
  'billing',
] as const

export type Slice = (typeof SLICES)[number]

/**
 * `base` with each slice's tree placed at `app.<slice>`.
 *
 * Throws on a collision with a key already in `app` rather than letting one side win: a slice
 * called `weddings` would silently replace the wedding list's own copy, in one locale or all
 * three depending on which files had it. Slices are named after features, not build slices
 * (they were `s1`..`s10` until the PR #1 review), which is exactly when this can fire -- and
 * why the wedding screens are `weddingPages`, not `wedding` or `weddings`, both taken.
 */
export function mergeSlices(
  base: AbstractIntlMessages,
  slices: Readonly<Record<string, AbstractIntlMessages>>,
): AbstractIntlMessages {
  const baseApp = base.app
  if (typeof baseApp !== 'object' || baseApp === null) {
    throw new Error('messages: the base catalogue has no `app` object to merge slices under')
  }
  for (const id of Object.keys(slices)) {
    if (id in baseApp) {
      throw new Error(`messages: slice "${id}" collides with app.${id} in the base catalogue`)
    }
  }
  return { ...base, app: { ...baseApp, ...slices } }
}

/** The runtime loader. One locale's worth of imports, so a request pays for one language. */
export async function loadMessages(locale: Locale): Promise<AbstractIntlMessages> {
  const base: AbstractIntlMessages = (await import(`../../messages/${locale}.json`)).default
  const entries = await Promise.all(
    SLICES.map(
      async (id) =>
        [id, (await import(`../../messages/app/${id}.${locale}.json`)).default] as const,
    ),
  )
  return mergeSlices(base, Object.fromEntries(entries))
}
