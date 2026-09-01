/**
 * The one icon two auth surfaces both draw.
 *
 * `auth-flow.tsx` uses it on rung 0's explicit passkey control; `enrollment-prompt.tsx`
 * uses it on the shell's offer. Its own file rather than an export from either, because
 * importing it from `auth-flow.tsx` would pull a 900-line client component into the
 * dashboard bundle for the sake of eight lines of SVG.
 *
 * The other two marks on the sign-in surface -- the tick and Google's "G" -- have exactly
 * one call site each and stay where they are drawn. A shared file for a single-use icon is
 * a second place to look for no reason.
 */
export function KeyIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
      className="size-3.5"
    >
      <rect x="2.5" y="6.5" width="11" height="7.5" rx="1.6" />
      <path d="M5.2 6.5V4.4a2.8 2.8 0 015.6 0v2.1" />
    </svg>
  )
}
