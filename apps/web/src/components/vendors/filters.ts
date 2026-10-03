'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * The vendor tables' filters: which categories exist, how many rows each holds, and the URL that
 * remembers the choice. Shared by the studio directory and the wedding's vendor list.
 */

export type FilterLabels = {
  /** The category chips' group name, e.g. "Filter by category". */
  category: string
  all: string
  /** The status select's name and its "every status" option (the wedding list only). */
  status: string
  allStatuses: string
  noMatch: string
  clear: string
}

export type CategoryFacet = {
  /** What the filter matches on: the category trimmed and lower-cased. */
  readonly key: string
  /** What the chip says: the first spelling met in the list. */
  readonly label: string
  readonly count: number
}

/**
 * `category` is free text (`schema/vendors.ts` says why), so "Fotograaf" and "fotograaf " are two
 * spellings of one category typed on two different days. Matching on this key puts them behind
 * one chip; matching on the raw string would show the planner two chips for one thing, which is
 * exactly the spreadsheet tidying this product is meant to save.
 */
export function categoryKey(category: string): string {
  return category.trim().toLowerCase()
}

/**
 * One facet per category that some row in `all` carries, counted over `counted` -- the rows the
 * OTHER filters (search, status) let through, so a chip says how many rows clicking it will show.
 *
 * Only categories that exist, and not a fixed list with zeros: there is no fixed list. The field
 * is free text per studio, so the data is the only vocabulary there is. The chips come from `all`
 * and not from `counted` so that they hold still while the planner types a search -- a chip that
 * vanishes mid-word moves every chip after it under the pointer. Alphabetical, like a
 * spreadsheet's filter dropdown, because that is where a planner's eye already looks.
 */
export function categoryFacets(
  all: readonly { category: string }[],
  counted: readonly { category: string }[],
): CategoryFacet[] {
  const labels = new Map<string, string>()
  for (const row of all) {
    const key = categoryKey(row.category)
    if (key && !labels.has(key)) labels.set(key, row.category.trim())
  }
  const counts = new Map<string, number>()
  for (const row of counted) {
    const key = categoryKey(row.category)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...labels]
    .map(([key, label]) => ({ key, label, count: counts.get(key) ?? 0 }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * The facet the URL's `category` names, or `null` for "all". A value that names no category on
 * this list -- an old link, or the last vendor of that category archived -- is "all", and not an
 * empty table with no chip pressed: the same choice `parseFilter` makes for the checklist.
 */
export function activeCategory(facets: readonly CategoryFacet[], value: string): string | null {
  const key = categoryKey(value)
  return facets.some((f) => f.key === key) ? key : null
}

export function inCategory(row: { category: string }, key: string | null): boolean {
  return key === null || categoryKey(row.category) === key
}

/**
 * How long the URL trails the screen. Safari throws `SecurityError` past 100 `replaceState` calls
 * in 30 seconds, which one search typed per keystroke can reach; the table itself never waits on
 * this.
 */
const URL_DELAY_MS = 250

/**
 * Filter state that lives in the URL's query string, so a reload or coming Back to the list finds
 * it as it was left, and a filtered list is a link a planner can send.
 *
 * Read once from `useSearchParams` and then held in React state; written back with
 * `history.replaceState`, which Next keeps in step with its router without a request.
 *
 * Rejected: chips as `<Link>`s to `?category=`, as the checklist and the weddings list do. Every
 * click would be a server render and a database read to show rows already on the screen, and the
 * directory's search (spec 0003 S3: "as you type, no round trip") would have to become a submit.
 * Rejected too: `pushState`, so Back undoes one filter. React state does not follow a popstate,
 * and following it means a URL update racing the keystroke that caused it -- a search box whose
 * text jumps back a letter. The cost: Back leaves the list rather than undoing the last chip.
 */
export function useUrlFilters<K extends string>(
  keys: readonly K[],
): [Record<K, string>, (patch: Partial<Record<K, string>>) => void] {
  // `null` outside an App Router tree (a test rendering the component bare): no filters.
  const params = useSearchParams() as URLSearchParams | null
  const [state, setState] = useState(
    () => Object.fromEntries(keys.map((k) => [k, params?.get(k) ?? ''])) as Record<K, string>,
  )

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(window.location.search)
      for (const k of Object.keys(state) as K[]) {
        const v = state[k].trim()
        if (v) next.set(k, v)
        else next.delete(k)
      }
      const query = next.toString()
      const search = query ? `?${query}` : ''
      if (search === window.location.search) return
      try {
        window.history.replaceState(null, '', `${window.location.pathname}${search}`)
      } catch {
        // Safari's rate limit (above). The table is already right; only the bookmark is late.
      }
    }, URL_DELAY_MS)
    // Cleared on unmount too: a write landing after a navigation would put this page's
    // filters on the next page's URL.
    return () => clearTimeout(timer)
  }, [state])

  const update = (patch: Partial<Record<K, string>>) => setState((s) => ({ ...s, ...patch }))
  return [state, update]
}
