import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { StorageTransport } from '@guestnote/storage'
import { isUuid } from './uuid.ts'

/**
 * The development stand-in for the files bucket: a `StorageTransport` that signs URLs to a
 * local route, and the two handlers that route calls. It exists because no bucket exists in
 * development, and a Files screen that cannot upload cannot be built or checked.
 *
 * It is the same shape as the console mail transport, and lives in the app rather than in
 * `packages/storage` for the same reason `packages/email/src/console.ts` gives: the decision
 * to use it is made from `NODE_ENV`, and packages read no environment. `lib/storage.ts` makes
 * that decision; nothing in this file reads one.
 *
 * ## The URLs are signed anyway
 *
 * Nothing here needs it -- the route 404s outside development. It is signed so the browser code
 * path is the one production runs: a client that sends the wrong `Content-Type` or the wrong
 * length is refused here as S3 would refuse it, instead of working locally and failing on
 * staging. The secret is a constant, not a random one per process, because `next dev` compiles
 * the Server Function and the route handler as separate bundles with separate module state, and
 * a random secret made each reject the other's URLs.
 *
 * ## URLs are relative
 *
 * `/api/dev-files/<key>?...`, resolved by the browser against whichever origin rendered the page.
 * Building an absolute one would need the app host and port here, which is two more env reads
 * for a URL that is only ever used from the page that asked for it.
 */

const SECRET = 'guestnote-dev-files-not-a-secret'

/** `<org>/<wedding>/<file>`, all UUIDs. The route's traversal guard, whatever the signature says. */
function isObjectKey(key: string): boolean {
  const parts = key.split('/')
  return parts.length === 3 && parts.every(isUuid)
}

export const DEV_FILES_PREFIX = '/api/dev-files/'

type Signed = {
  readonly method: 'GET' | 'PUT'
  readonly key: string
  readonly exp: number
  readonly ct: string
  readonly cl: string
  readonly cd: string
}

function sign(s: Signed): string {
  return createHmac('sha256', SECRET)
    .update(JSON.stringify([s.method, s.key, s.exp, s.ct, s.cl, s.cd]))
    .digest('hex')
}

function urlFor(s: Signed): string {
  const q = new URLSearchParams({
    exp: String(s.exp),
    ct: s.ct,
    cl: s.cl,
    cd: s.cd,
    sig: sign(s),
  })
  return `${DEV_FILES_PREFIX}${s.key}?${q}`
}

function verify(
  method: 'GET' | 'PUT',
  key: string,
  query: URLSearchParams,
  now: Date,
): Signed | null {
  const exp = Number(query.get('exp'))
  const sig = query.get('sig') ?? ''
  const signed: Signed = {
    method,
    key,
    exp,
    ct: query.get('ct') ?? '',
    cl: query.get('cl') ?? '',
    cd: query.get('cd') ?? '',
  }
  if (!isObjectKey(key) || !Number.isFinite(exp) || exp * 1000 < now.getTime()) return null

  const expected = Buffer.from(sign(signed))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  return signed
}

export type DevFiles = {
  readonly transport: StorageTransport
  put(key: string, query: URLSearchParams, request: Request): Promise<Response>
  get(key: string, query: URLSearchParams): Promise<Response>
}

export function createDevFiles(config: { dir: string; now?: () => Date }): DevFiles {
  const now = config.now ?? (() => new Date())
  const path = (key: string) => join(config.dir, ...key.split('/'))

  return {
    transport: {
      name: 'dev-files',
      async presignPut(input) {
        const exp = Math.floor(input.signingDate.getTime() / 1000) + input.expiresInSeconds
        return {
          ok: true,
          url: urlFor({
            method: 'PUT',
            key: input.key,
            exp,
            ct: input.contentType,
            cl: String(input.contentLength),
            cd: '',
          }),
        }
      },
      async presignGet(input) {
        const exp = Math.floor(input.signingDate.getTime() / 1000) + input.expiresInSeconds
        return {
          ok: true,
          url: urlFor({
            method: 'GET',
            key: input.key,
            exp,
            ct: '',
            cl: '',
            cd: input.contentDisposition,
          }),
        }
      },
    },

    async put(key, query, request) {
      const signed = verify('PUT', key, query, now())
      if (!signed) return new Response('Forbidden', { status: 403 })

      // What S3 does with a signed header that disagrees with the request: refuse it.
      if (request.headers.get('content-type') !== signed.ct) {
        return new Response('Content-Type does not match the signed URL', { status: 403 })
      }
      const body = new Uint8Array(await request.arrayBuffer())
      if (String(body.byteLength) !== signed.cl) {
        return new Response('Content-Length does not match the signed URL', { status: 403 })
      }

      await mkdir(dirname(path(key)), { recursive: true })
      await writeFile(path(key), body)
      await writeFile(`${path(key)}.type`, signed.ct)
      return new Response(null, { status: 200 })
    },

    async get(key, query) {
      const signed = verify('GET', key, query, now())
      if (!signed) return new Response('Forbidden', { status: 403 })

      try {
        const [body, type] = await Promise.all([
          readFile(path(key)),
          readFile(`${path(key)}.type`, 'utf8'),
        ])
        return new Response(new Uint8Array(body), {
          status: 200,
          headers: {
            'Content-Type': type,
            'Content-Disposition': signed.cd,
            'Cache-Control': 'private, no-store',
            // Uploaded content is untrusted; never let a browser guess a more dangerous type.
            'X-Content-Type-Options': 'nosniff',
          },
        })
      } catch {
        return new Response('Not found', { status: 404 })
      }
    },
  }
}
