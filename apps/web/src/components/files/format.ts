/**
 * How a file is described in a list. Pure, so the two screens and the tests share one answer.
 */

const UNITS = ['B', 'KB', 'MB', 'GB'] as const

/**
 * `1536` -> `1,5 KB` in `nl`. Powers of 1024 with the decimal-style unit names, which is what
 * a planner's operating system shows them. One decimal from KB up, none for bytes.
 */
export function formatSize(bytes: number, locale: string): string {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 ? 0 : 1
  const n = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
  return `${n} ${UNITS[unit]}`
}

const LABELS: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'text/plain': 'TXT',
  'text/csv': 'CSV',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
}

/** The short label a person recognises. Unknown types fall back to the subtype, upper-cased. */
export function kindLabel(mime: string): string {
  const known = LABELS[mime]
  if (known) return known
  const sub = mime.split('/')[1]
  return sub ? sub.toUpperCase() : mime.toUpperCase()
}

/** `IMG_2031.heic` -> `IMG_2031`. A dotfile or a bare name is left alone. */
export function withoutExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}
