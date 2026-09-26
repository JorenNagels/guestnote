import type { LogoDone, StartLogo } from '../../lib/studio-logo.ts'

/**
 * The browser half of a logo upload, and the one mapping from what went wrong to what the
 * planner is told. A plain module, not a hook, for the reason `components/files/upload.ts`
 * gives: the three steps' order can then be tested against fakes without a DOM.
 */

/** The three sentences the field can say (spec 0005, Copy: `logo.notImage` / `logo.tooLarge`). */
export type LogoError = 'notImage' | 'tooLarge' | 'failed'

export type LogoResult = { readonly ok: true } | { readonly ok: false; readonly error: LogoError }

/**
 * `invalidSize` is an empty or unreadable file, which is not an image either -- so it gets the
 * sentence that tells the planner what to pick instead. Everything that is not the file's fault
 * (a refused role, a signing failure, a dropped connection) is `failed`: "try again".
 */
export function logoErrorOf(code: string): LogoError {
  if (code === 'typeNotAllowed' || code === 'invalidSize') return 'notImage'
  if (code === 'tooLarge') return 'tooLarge'
  return 'failed'
}

/**
 * The spec's limits, restated for the one place that must answer before the server can: sign-up
 * holds a picked logo until the studio exists (`studio-step.tsx`), and "that file is over 2 MB"
 * belongs next to the file, not after "Create studio". `@guestnote/storage` stays the judge --
 * the upload is signed there, against its own list -- and `logo-upload.test.ts` fails if these
 * two drift from its `ALLOWED_CONTENT_TYPES.logo` and `LOGO_MAX_BYTES`. Restated rather than
 * imported because that package's entry point pulls the S3 SDK into a client bundle.
 */
export const LOGO_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp']
export const LOGO_MAX_BYTES = 2 * 1024 * 1024
export const LOGO_ACCEPT = LOGO_TYPES.join(',')

export function checkLogoFile(file: File): LogoResult {
  if (file.size <= 0 || !LOGO_TYPES.includes(file.type.toLowerCase())) {
    return { ok: false, error: 'notImage' }
  }
  if (file.size > LOGO_MAX_BYTES) return { ok: false, error: 'tooLarge' }
  return { ok: true }
}

export type LogoUploadDeps = {
  start(input: { mime: string; sizeBytes: number }): Promise<StartLogo>
  confirm(fileId: string): Promise<LogoDone>
  /** Injectable for tests; the browser's `fetch` otherwise. */
  fetch?: typeof fetch
}

/** Sign, PUT, confirm. Never throws. */
export async function uploadLogo(file: File, deps: LogoUploadDeps): Promise<LogoResult> {
  const send = deps.fetch ?? fetch
  try {
    const started = await deps.start({ mime: file.type, sizeBytes: file.size })
    if (!started.ok) return { ok: false, error: logoErrorOf(started.error) }

    const put = await send(started.url, { method: 'PUT', headers: started.headers, body: file })
    if (!put.ok) return { ok: false, error: 'failed' }

    const confirmed = await deps.confirm(started.fileId)
    return confirmed.ok ? { ok: true } : { ok: false, error: logoErrorOf(confirmed.error) }
  } catch {
    return { ok: false, error: 'failed' }
  }
}
