/**
 * The mark, inlined.
 *
 * ## Why inline and not `<img src="/guestnote-logo.svg">`
 *
 * Two reasons, and the first one is a bug this file exists to route around:
 *
 * 1. **`public/` does not work on the app host.** proxy.ts rewrites every non-`/api`
 *    path on `app.guestnote.be` to `/pro/*`, and its matcher excludes only
 *    `_next/static`, `_next/image`, `favicon.ico`, `robots.txt` and `sitemap.xml`. A
 *    file in `public/` is none of those, so `/guestnote-logo.svg` becomes
 *    `/pro/guestnote-logo.svg` and 404s. Measured, not assumed. Any future static asset
 *    on this host needs a matcher entry or the same treatment as this one.
 *
 * 2. **One fewer request on the screen that can least afford it.** The sign-in surface
 *    is designed for a planner on venue wifi with one bar of signal. A separate round
 *    trip for a 2KB mark is a round trip that can hang.
 *
 * ## The colours are frozen
 *
 * `--logo-teal` #94CFC9 and `--logo-gold` #D6B776 are hard-coded here rather than read
 * from tokens, deliberately. design-system/tokens.css calls them "THE MARK ONLY": both
 * sit at OKLCH L=0.80, giving 1.10:1 against each other and ~1.8:1 on white. They are
 * unusable for text, borders, icons, state or series, and the surest way to keep them
 * out of the UI is to leave them where no semantic token can reach them.
 *
 * WCAG 1.4.11 does not apply: this is a logo, which is explicitly exempt.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1242 1351"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      // Decorative wherever it is used: every placement so far sets the product name in
      // text beside it, and a title here would make a screen reader say "Guestnote"
      // twice in a row.
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        d="M1230.49 461.398C1219.73 450.685 1202.32 450.727 1191.6 461.493L596 1060.25L310.415 772.402C281.459 743.141 265.229 703.715 265.229 662.642C265.229 621.568 281.459 582.143 310.415 552.882C324.476 538.628 341.25 527.307 359.756 519.578C378.262 511.85 398.13 507.868 418.198 507.868C438.267 507.868 458.136 511.849 476.642 519.578C495.147 527.307 511.921 538.628 525.982 552.882L596 624.226L665.742 553.431C679.752 538.997 696.543 527.524 715.109 519.697C733.676 511.871 753.639 507.851 773.802 507.88C793.872 507.863 813.744 511.835 832.252 519.563C850.76 527.29 867.532 538.618 881.585 552.882C907.719 579.292 923.485 613.982 926.31 650.689L973.467 603.532C963.711 570.281 945.821 539.614 921.004 514.466C901.794 495.008 878.884 479.553 853.611 469C828.338 458.447 801.208 453.008 773.802 453C746.391 452.977 719.25 458.402 693.973 468.957C668.696 479.512 645.79 494.984 626.599 514.466L596 545.199L565.401 514.466C546.186 495.019 523.275 479.573 498.002 469.03C472.729 458.487 445.601 453.058 418.198 453.058C390.796 453.058 363.667 458.487 338.395 469.03C313.122 479.573 290.21 495.019 270.995 514.466C231.903 554.079 210 607.387 210 662.916C210 718.445 231.903 771.754 270.995 811.367L596 1139L1230.59 500.289C1241.3 489.523 1241.26 472.111 1230.49 461.398Z"
        fill="#D6B776"
      />
      <path
        d="M756.228 4.78809C776.043 -0.280067 795.5 14.6868 795.5 35.3145V212.5H740.5V66.5361L233.613 212.5H39L28.8315 214L755.283 5.04395L756.228 4.78809Z"
        fill="#94CFC9"
      />
      <path
        d="M994.903 212.512C1013.82 212.991 1029 228.472 1029 247.5V507.876C1016.75 487.487 1002.04 468.457 985.063 451.249L985.057 451.241L985.05 451.234L983.752 449.929C980.57 446.745 977.318 443.639 974 440.609V267.5H59V1292.5H974V885.736L984.899 874.749L984.982 874.666L985.063 874.583C1002.04 857.375 1016.75 838.344 1029 817.955V1312.5C1029 1331.53 1013.82 1347.01 994.903 1347.49L994 1347.5H39C19.9721 1347.5 4.49085 1332.32 4.01172 1313.4L4 1312.5V247.5C4 228.17 19.67 212.5 39 212.5H233.613H994L994.903 212.512Z"
        fill="#94CFC9"
      />
    </svg>
  )
}
