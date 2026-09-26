'use server'

import { MAX_STUDIO_NAME, renameStudio } from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import type { RenameState } from '../../../../components/studio/rename-form.tsx'
import { getDb } from '../../../../lib/db.ts'
import { currentCaller } from '../../../../lib/principal.ts'
import {
  confirmLogo,
  type LogoDone,
  removeLogo,
  type StartLogo,
  startLogoUpload,
} from '../../../../lib/studio-logo.ts'

/**
 * The Studio page's Server Functions (spec 0005). **Not guarded by `(app)/layout.tsx` or by the
 * page's 404** -- a Server Function is a POST to its own route (CLAUDE.md invariant 7) -- so each
 * resolves the caller itself through `currentCaller`, which validates the `gn_org` cookie
 * against the user's own memberships. The role is then decided by `principalForOrg`, in
 * `lib/studio-logo.ts` and in `renameStudio`, before anything is signed or written: a `member`
 * is refused by both. Nothing here takes an org id from the client.
 *
 * `DASHBOARD_TREE`-style revalidation (`/pro`, layout): the logo and the name are drawn by the
 * sidebar, so the layout is what has gone stale, not only this page.
 */

const TREE = '/pro'

export async function startStudioLogoUpload(input: {
  mime: string
  sizeBytes: number
}): Promise<StartLogo> {
  const caller = await currentCaller()
  if (!caller) return { ok: false, error: 'forbidden' }
  return startLogoUpload(caller, input)
}

export async function confirmStudioLogo(fileId: string): Promise<LogoDone> {
  const caller = await currentCaller()
  if (!caller) return { ok: false, error: 'forbidden' }
  const done = await confirmLogo(caller, fileId)
  if (done.ok) revalidatePath(TREE, 'layout')
  return done
}

export async function removeStudioLogo(): Promise<LogoDone> {
  const caller = await currentCaller()
  if (!caller) return { ok: false, error: 'forbidden' }
  const done = await removeLogo(caller)
  if (done.ok) revalidatePath(TREE, 'layout')
  return done
}

export async function renameStudioAction(
  _prev: RenameState,
  formData: FormData,
): Promise<RenameState> {
  const raw = formData.get('name')
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (name === '') return { error: 'required', value: name }
  if (name.length > MAX_STUDIO_NAME) return { error: 'tooLong', value: name }

  const caller = await currentCaller()
  if (!caller) return { error: 'failed', value: name }
  const renamed = await renameStudio(getDb(), caller.memberships, caller.orgId, name)
  if (!renamed.ok) return { error: 'failed', value: name }
  revalidatePath(TREE, 'layout')
  return { saved: true, value: name }
}
