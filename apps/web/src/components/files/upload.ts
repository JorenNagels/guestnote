import type { Done, FileFailure, StartUpload } from '../../lib/wedding-files.ts'

/**
 * The browser half of an upload: ask the server to sign, PUT the bytes, tell the server it
 * worked. It is a plain module, not a hook, so the order of the three steps can be tested
 * against fakes without a DOM.
 *
 * ## The server is the only judge of type and size
 *
 * No `File.size` or `File.type` check happens here. `packages/storage` owns the limits, and a
 * second copy in the client would drift; a refusal costs one round trip and no bytes, because
 * the server signs nothing for a file it will not take. The exception is the `Content-Length`
 * header, which the browser sets itself from the body and refuses to be handed.
 */

export type UploadError = FileFailure | 'network' | 'uploadFailed'

export type UploadVisibility = 'shared' | 'internal'

export type UploadDeps = {
  start(input: {
    name: string
    mime: string
    sizeBytes: number
    visibility: UploadVisibility
  }): Promise<StartUpload>
  confirm(fileId: string): Promise<Done>
  /** Injectable for tests; the browser's `fetch` otherwise. */
  fetch?: typeof fetch
}

export type UploadOutcome =
  | { readonly ok: true; readonly fileId: string }
  | { readonly ok: false; readonly error: UploadError }

export async function uploadFile(
  file: File,
  options: { name: string; visibility: UploadVisibility },
  deps: UploadDeps,
): Promise<UploadOutcome> {
  const send = deps.fetch ?? fetch
  try {
    const started = await deps.start({
      name: options.name,
      mime: file.type,
      sizeBytes: file.size,
      visibility: options.visibility,
    })
    if (!started.ok) return { ok: false, error: started.error }

    const put = await send(started.url, { method: 'PUT', headers: started.headers, body: file })
    if (!put.ok) return { ok: false, error: 'uploadFailed' }

    const confirmed = await deps.confirm(started.fileId)
    if (!confirmed.ok) return { ok: false, error: confirmed.error }
    return { ok: true, fileId: started.fileId }
  } catch {
    // A rejected fetch, or a Server Function that could not be reached. The two are the same
    // to a planner on a venue connection: it did not go, try again.
    return { ok: false, error: 'network' }
  }
}

/** Three at a time: enough to feel parallel, few enough to leave the connection to the page. */
export const UPLOAD_CONCURRENCY = 3

/**
 * Runs `worker` over `items` with at most `UPLOAD_CONCURRENCY` in flight. Resolves when all
 * are done; a worker is expected not to throw (`uploadFile` never does).
 */
export async function inPool<T>(items: readonly T[], worker: (item: T) => Promise<void>) {
  let next = 0
  const lane = async () => {
    for (let i = next++; i < items.length; i = next++) {
      const item = items[i]
      if (item !== undefined) await worker(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, items.length) }, lane))
}
