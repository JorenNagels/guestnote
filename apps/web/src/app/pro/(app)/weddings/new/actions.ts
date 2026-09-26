'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createWeddingFromForm } from '../../../../../lib/create-wedding.ts'
import { currentMemberships, currentOrgId } from '../../../../../lib/principal.ts'
import { app } from '../../../../../lib/routes.ts'
import { assertWritable } from '../../../../../lib/trial.ts'
import type { FormState } from '../../../../../lib/wedding-form-state.ts'

/**
 * Creates a wedding and lands on its overview.
 *
 * Does its own authorization, as every Server Function must (invariant 7): the route group's
 * layout never runs for a POST. The org is the one the dashboard is acting in; the permission
 * check, the parse and the write are `lib/create-wedding.ts`, shared with sign-up.
 *
 * `/pro` and `'layout'` for the same rewrite reason `(app)/actions.ts` gives: the sidebar lists
 * weddings, and it is the layout that has gone stale.
 */
export async function createWeddingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await assertWritable(await currentOrgId())
  const [memberships, orgId] = await Promise.all([currentMemberships(), currentOrgId()])
  if (!memberships || !orgId) return { form: 'forbidden' }

  const created = await createWeddingFromForm(memberships, orgId, formData)
  if (!created.ok) return created.state

  revalidatePath('/pro', 'layout')
  redirect(app.wedding(created.id))
}
