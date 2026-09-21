import { getDevFiles } from '../../../../lib/storage.ts'

/**
 * The development stand-in for the files bucket's presigned URLs (`lib/dev-files.ts`).
 *
 * **It answers only when `lib/storage.ts` chose the local directory**, which it does in
 * development with no bucket configured and nowhere else. In every other case the route is a
 * plain 404: `getDevFiles()` returns `null` when a real bucket is in use, and throws when a
 * deployed environment has neither, which is caught here so a probe of this path never
 * turns a misconfiguration into a 500 with the reason in it.
 *
 * `proxy.ts` lets `/api/*` through on the app host and 404s it on the others, so this is
 * reachable at `app.<domain>/api/dev-files/...` and nowhere else. It needs no session: the URL
 * is the credential, exactly as an S3 presigned URL is, and the signature is checked in
 * `lib/dev-files.ts`.
 */

async function store() {
  try {
    return getDevFiles()
  } catch {
    return null
  }
}

const notFound = () => new Response('Not found', { status: 404 })

type Ctx = { params: Promise<{ key: string[] }> }

export async function PUT(request: Request, { params }: Ctx) {
  const dev = await store()
  if (!dev) return notFound()
  const { key } = await params
  return dev.put(key.join('/'), new URL(request.url).searchParams, request)
}

export async function GET(request: Request, { params }: Ctx) {
  const dev = await store()
  if (!dev) return notFound()
  const { key } = await params
  return dev.get(key.join('/'), new URL(request.url).searchParams)
}
