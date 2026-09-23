import 'server-only'
import { join } from 'node:path'
import { createS3Transport, createStorage, type Storage } from '@guestnote/storage'
import { env } from '../env.ts'
import { createDevFiles, type DevFiles } from './dev-files.ts'

/**
 * The app's single file storage, and the only place that knows a bucket name or a region.
 *
 * `packages/storage` takes its configuration as arguments (invariant 6), so this is where env
 * is joined to it. Everything else in the app calls `getStorage()`.
 *
 * Memoised for the reason `getDb()` and `lib/mailer.ts` are: on Lambda module scope survives
 * between invocations, so a warm container reuses one S3 client and one resolved credential
 * chain. Built lazily rather than at import because `next build` imports route modules while
 * collecting page data, and a bucket must not be a build-time dependency.
 */

/** Gitignored. Absolute, because `createDevFiles` cannot know where the app was started from. */
const DEV_FILES_DIR = join(process.cwd(), '.files')

type Built = { readonly storage: Storage; readonly dev: DevFiles | null }
let cached: Built | undefined

/**
 * A real bucket when `GUESTNOTE_FILES_BUCKET` is set; a local directory in development when it
 * is not; an error everywhere else.
 *
 * The shape of `transportFor()` in `lib/mailer.ts`, and for the same reason: **the value you
 * get by forgetting is the safe one.** A deployed environment that never set the bucket must
 * not fall back to writing uploads under the function's filesystem -- read-only on Lambda, and
 * on any host that is writable it would be a private document store nobody backs up. It throws
 * instead, and the first upload says why.
 *
 * With the bucket set in development you get S3 through your own AWS credentials, which is how
 * a laptop is pointed at the staging bucket (`sst.config.ts` allows the localhost origin there).
 */
function build(): Built {
  if (env.filesBucket) {
    const storage = createStorage({
      transport: createS3Transport({ region: env.awsRegion, bucket: env.filesBucket }),
    })
    return { storage, dev: null }
  }

  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'GUESTNOTE_FILES_BUCKET is not set. Deployed environments upload to the private files ' +
        'bucket that sst.config.ts creates and passes in; only development may fall back to a ' +
        'local directory. Set it, or fix the deploy that dropped it. See ' +
        'apps/web/src/lib/storage.ts and packages/storage/README.md.',
    )
  }

  const dev = createDevFiles({ dir: DEV_FILES_DIR })
  return { storage: createStorage({ transport: dev.transport }), dev }
}

function built(): Built {
  cached ??= build()
  return cached
}

export function getStorage(): Storage {
  return built().storage
}

/**
 * The local store behind `app/api/dev-files`, or `null` when this process is talking to a real
 * bucket. Reading it also runs `build()`, so a deployed environment that reaches that route
 * gets the same refusal an upload would, and never a route that serves a directory.
 */
export function getDevFiles(): DevFiles | null {
  return built().dev
}
