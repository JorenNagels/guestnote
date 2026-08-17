/**
 * Tenant theme contract for <couple>.guestnote.be
 *
 * Wedding sites reuse the SAME semantic token names as the dashboard but never
 * its values -- a tenant site must not look like Guestnote. One row per wedding
 * (spec F1 / milestone M2-M4) feeds `toCssVars()`, which is injected on :root at
 * request time.
 *
 * The validator exists because the seed app already shipped unreadable sites:
 * paulien-sander has body text at 1.74:1 and borders at 1.00:1. Once couples
 * pick their own colours self-serve, nothing else stops that repeating.
 * Run `validateTheme()` on save, and refuse to publish on error.
 */

export type ThemeColors = {
  /** page background -- the dominant surface */
  page: string;
  /** raised surface: cards, panels, form wells. Usually white or near-white. */
  surface: string;
  /** inverted surface: footer, dark hero bands */
  surfaceInverse: string;
  /** secondary tinted panel, for alternating sections */
  surfaceAccent: string;

  /** body copy, on `page` and on `surface` */
  textBody: string;
  /** headings, on `page` and on `surface` */
  textHeading: string;
  /** text sitting on `surfaceInverse` */
  textOnInverse: string;
  /** hairlines and dividers. Decorative -- no contrast minimum. */
  border: string;

  /** primary CTA fill (RSVP button) */
  primary: string;
  /** label on `primary` */
  primaryForeground: string;
  /** highlights, links, small flourishes */
  accent: string;
  /** label on `accent` */
  accentForeground: string;
};

export type ThemeFonts = {
  heading: string;
  body: string;
};

export type Theme = {
  colors: ThemeColors;
  fonts: ThemeFonts;
};

/** Old `background-0..3` / `foreground-0..3` keys -> semantic names. */
export const LEGACY_KEY_MAP = {
  'background-0': 'surface',
  'background-1': 'page',
  'background-2': 'surfaceInverse',
  'background-3': 'surfaceAccent',
  'foreground-0': 'border',
  'foreground-1': 'textBody',
  'foreground-2': 'textHeading',
  'foreground-3': 'textOnInverse',
  primary: 'primary',
  'primary-foreground': 'primaryForeground',
  accent: 'accent',
  'accent-foreground': 'accentForeground',
} as const satisfies Record<string, keyof ThemeColors>;

/* -------------------------------------------------------------------------- */
/* contrast                                                                   */
/* -------------------------------------------------------------------------- */

function channel(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Relative luminance per WCAG 2.1. Accepts #rgb or #rrggbb. */
export function luminance(hex: string): number {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`not a hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1..21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* -------------------------------------------------------------------------- */
/* validation                                                                 */
/* -------------------------------------------------------------------------- */

export type ThemeIssue = {
  severity: 'error' | 'warning';
  pair: string;
  ratio: number;
  required: number;
  message: string;
};

/**
 * Pairs that must hold for a wedding site to be readable.
 *
 * 4.5 = body text (WCAG 1.4.3 AA). 3.0 = large text >=24px, and UI component
 * boundaries (1.4.11). `border` is absent on purpose: decorative dividers are
 * exempt, so forcing 3:1 there would mandate heavy borders on every template.
 */
const RULES: ReadonlyArray<{
  fg: keyof ThemeColors;
  bg: keyof ThemeColors;
  required: number;
  label: string;
}> = [
  { fg: 'textBody', bg: 'page', required: 4.5, label: 'body text on the page' },
  { fg: 'textBody', bg: 'surface', required: 4.5, label: 'body text on cards' },
  { fg: 'textHeading', bg: 'page', required: 3.0, label: 'headings on the page' },
  { fg: 'textHeading', bg: 'surface', required: 3.0, label: 'headings on cards' },
  { fg: 'textOnInverse', bg: 'surfaceInverse', required: 4.5, label: 'text on the dark band' },
  { fg: 'textBody', bg: 'surfaceAccent', required: 4.5, label: 'body text on tinted panels' },
  { fg: 'primaryForeground', bg: 'primary', required: 4.5, label: 'the RSVP button label' },
  { fg: 'accentForeground', bg: 'accent', required: 4.5, label: 'the accent label' },
];

/**
 * Validate a tenant theme. Empty array means publishable.
 *
 * Errors block publishing. Warnings are judgement calls -- surface them in the
 * editor but let the couple through.
 */
export function validateTheme(colors: ThemeColors): ThemeIssue[] {
  const issues: ThemeIssue[] = [];

  for (const { fg, bg, required, label } of RULES) {
    const ratio = contrast(colors[fg], colors[bg]);
    if (ratio < required) {
      issues.push({
        severity: 'error',
        pair: `${fg} on ${bg}`,
        ratio: Math.round(ratio * 100) / 100,
        required,
        message:
          `${label} is unreadable at ${ratio.toFixed(2)}:1 (needs ${required}:1). ` +
          `Darken ${fg} or lighten ${bg}.`,
      });
    }
  }

  // A border indistinguishable from what it sits on is almost always a mistake
  // rather than a choice -- both seed weddings hit exactly this.
  const borderRatio = contrast(colors.border, colors.page);
  if (borderRatio < 1.2) {
    issues.push({
      severity: 'warning',
      pair: 'border on page',
      ratio: Math.round(borderRatio * 100) / 100,
      required: 1.2,
      message:
        `border is visually identical to the page (${borderRatio.toFixed(2)}:1), ` +
        `so dividers will not render. Intentional?`,
    });
  }

  return issues;
}

export function assertPublishable(colors: ThemeColors): void {
  const errors = validateTheme(colors).filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    throw new Error(
      `theme is not publishable:\n${errors.map((e) => `  - ${e.message}`).join('\n')}`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* rendering                                                                  */
/* -------------------------------------------------------------------------- */

const CSS_VAR: Record<keyof ThemeColors, string> = {
  page: 'background',
  surface: 'card',
  surfaceInverse: 'surface-inverse',
  surfaceAccent: 'accent-panel',
  textBody: 'foreground',
  textHeading: 'heading',
  textOnInverse: 'on-inverse',
  border: 'border',
  primary: 'primary',
  primaryForeground: 'primary-foreground',
  accent: 'accent',
  accentForeground: 'accent-foreground',
};

/**
 * Render a theme as a `:root` declaration block for server-side injection.
 *
 * Inline this in the document head rather than fetching it -- the site is ISR'd
 * per tenant, so the values are static per build and a second request would
 * flash unthemed content.
 */
export function toCssVars(theme: Theme): string {
  const colors = (Object.keys(CSS_VAR) as Array<keyof ThemeColors>)
    .map((k) => `  --${CSS_VAR[k]}: ${theme.colors[k]};`)
    .join('\n');
  return [
    ':root {',
    colors,
    `  --font-heading: ${JSON.stringify(theme.fonts.heading)}, Georgia, serif;`,
    `  --font-body: ${JSON.stringify(theme.fonts.body)}, system-ui, sans-serif;`,
    '}',
  ].join('\n');
}
