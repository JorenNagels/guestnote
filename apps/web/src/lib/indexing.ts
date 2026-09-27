import 'server-only'
import { env } from '../env.ts'

/**
 * The root domain search engines may index (spec 0006, "SEO"). Only production's; staging is a
 * COW clone of production data with the same pages (CLAUDE.md, "Deployment status"), and
 * letting it be indexed would split the ranking between two copies of one site.
 *
 * A literal, and not a flag: a flag that defaults to "index" puts staging in Google the day
 * someone forgets it, and one that defaults to "don't" hides production the same way. The
 * production apex is not a per-environment value; it is the product's name.
 */
const INDEXED_ROOT_DOMAIN = 'guestnote.be'

export function isIndexable(): boolean {
  return env.rootDomain === INDEXED_ROOT_DOMAIN
}
