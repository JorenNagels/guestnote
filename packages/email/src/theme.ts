/**
 * The design tokens an email is allowed to use, as literal hex.
 *
 * ## Why a copy exists at all
 *
 * `design-system/tokens.css` expresses everything as CSS custom properties, and every
 * consumer so far has been a browser. An email client is not one. Outlook on Windows
 * renders through Word, which has no `var()` support at all, and the fallback behaviour
 * is not "use the primitive" but "drop the declaration" -- so a `color: var(--foreground)`
 * email arrives as black-on-white if you are lucky and invisible if you are not.
 *
 * So the values are inlined. That is the only way, and it creates the obvious hazard:
 * a copied palette drifts from its source silently, and nobody notices until a customer
 * sees an email in last quarter's teal.
 *
 * ## What stops the drift
 *
 * `theme.test.ts`. It parses `design-system/tokens.css`, resolves each `var()` chain, and
 * fails when a value below no longer matches the token named beside it. `TOKEN_SOURCE` is
 * what makes that mechanical rather than a comment nobody re-reads -- it is the mapping
 * the test asserts against, so adding a colour here without naming its token is a failure,
 * not an omission.
 *
 * ## Light only, deliberately
 *
 * `tokens.css` has a `.dark` block. This does not. `prefers-color-scheme` support across
 * email clients is partial and inconsistent -- Outlook ignores it, Gmail on Android
 * force-inverts regardless of what you ask for -- so a dark variant here would be a
 * second palette that is honoured in some inboxes and silently ignored in others. One
 * palette that renders identically everywhere is worth more than two that do not. The
 * `color-scheme` meta in `templates/layout.tsx` asks clients not to invent their own.
 */

/**
 * Which token in `design-system/tokens.css` each value below comes from.
 *
 * Semantic names (`--foreground`) rather than primitives (`--neutral-900`) wherever one
 * exists, so a change to the semantic layer propagates here as a test failure rather than
 * being invisible because we pinned the primitive underneath it.
 */
export const TOKEN_SOURCE = {
  background: '--background',
  surface: '--card',
  foreground: '--foreground',
  mutedForeground: '--muted-foreground',
  muted: '--muted',
  border: '--border',
  primary: '--primary',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  logoTeal: '--logo-teal',
  logoGold: '--logo-gold',
} as const

export type ThemeColour = keyof typeof TOKEN_SOURCE

/** Resolved values of `TOKEN_SOURCE`, uppercase hex. Verified by `theme.test.ts`. */
export const COLOUR: Readonly<Record<ThemeColour, string>> = {
  background: '#FBFCFC',
  surface: '#FFFFFF',
  foreground: '#161D1C',
  mutedForeground: '#3F4947',
  muted: '#E8EFEE',
  border: '#D4DEDC',
  primary: '#206560',
  accent: '#F7ECD4',
  accentForeground: '#554111',
  logoTeal: '#94CFC9',
  logoGold: '#D6B776',
}

/**
 * The font stacks, minus the webfont.
 *
 * `tokens.css` leads the sans stack with `var(--font-google-sans)`, the self-hosted Google
 * Sans Flex file next/font serves (the Modern refresh, 2026-09-28). An email cannot reach
 * that file and should not try: a webfont in email costs a request that most clients block,
 * Outlook ignores `@font-face` entirely, and a mid-render fallback swap is worse than never
 * having asked. So the stack names the face and stops there: a recipient who happens to have
 * it installed gets it, and everyone else -- assumed to be nearly everyone, not measured --
 * gets the system face.
 *
 * These are NOT in TOKEN_SOURCE, because they are deliberately not equal to their token.
 */
export const FONT = {
  sans: '"Google Sans Flex", "Google Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const

/**
 * Pixels, never rem.
 *
 * The type scale is in rem throughout, which is right for a browser and wrong here: Outlook
 * resolves `rem` against nothing and several clients rewrite the root font size. Every
 * length in a template is an integer px.
 *
 * Two radii, as in `tokens.css` since the Modern refresh: `radius` for a container (the
 * card, the code box) is `--radius-container`, and `radiusControl` makes the call-to-action
 * a pill like the app's buttons. Outlook on Windows draws both square, which is fine.
 */
export const SIZE = {
  /** The classic email column. Wider than this and Outlook's reading pane clips it. */
  containerWidth: 600,
  radius: 20,
  radiusControl: 999,
  spaceSm: 8,
  spaceMd: 16,
  spaceLg: 24,
  spaceXl: 32,
} as const
