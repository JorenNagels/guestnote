/**
 * The politely-announced running commentary for changes that happen away from focus.
 *
 * Two rules it exists to enforce:
 *
 * 1. The region is in the DOM from first paint and only its TEXT changes. A live region
 *    that is inserted at the same moment as its message is frequently not announced at
 *    all, which is the single most common way this control is built wrong.
 * 2. It is `polite`, not `assertive`. Every message it carries -- "code sent",
 *    "signed in" -- is the expected consequence of something the visitor just did, and
 *    interrupting them to confirm their own action is noise.
 *
 * Field-level errors do NOT come through here; they belong to their control. See
 * InlineError.
 */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  )
}
