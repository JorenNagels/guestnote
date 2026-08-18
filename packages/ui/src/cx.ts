/**
 * Class joining, and nothing else.
 *
 * Deliberately not `clsx` + `tailwind-merge`: this package has one peer dependency and
 * adding two more to concatenate strings is a bad trade. Nothing here takes a `className`
 * that needs to *override* a base utility -- the components below expose their variable
 * slots instead, which is a stronger contract than last-class-wins.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
