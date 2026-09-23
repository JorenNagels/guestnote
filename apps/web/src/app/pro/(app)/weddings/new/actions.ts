'use server'

import { createWedding } from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb } from '../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../lib/principal.ts'
import { app } from '../../../../../lib/routes.ts'
import { slugFromName } from '../../../../../lib/slug.ts'
import {
  canCreateWedding,
  echoValues,
  type FormState,
} from '../../../../../lib/wedding-form-state.ts'
import { parseWeddingForm } from '../../../../../lib/wedding-parse.ts'

const FIELDS = ['coupleDisplayName', 'weddingDate', 'venue', 'headcount', 'color'] as const

/**
 * Creates a wedding and lands on its overview.
 *
 * Does its own authorization, as every Server Function must (invariant 7): the route group's
 * layout never runs for a POST. Owner and admin only -- `canCreateWedding` answers with a code
 * the form renders, and `createWedding` refuses a `member` again through the same principal
 * derivation the rest of the app uses, so this check is the sentence and the repo is the gate.
 *
 * `/pro` and `'layout'` for the same rewrite reason `(app)/actions.ts` gives: the sidebar lists
 * weddings, and it is the layout that has gone stale.
 */
export async function createWeddingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const [memberships, orgId] = await Promise.all([currentMemberships(), currentOrgId()])
  if (!memberships || !orgId || !canCreateWedding(memberships, orgId)) return { form: 'forbidden' }

  const values = echoValues(formData, FIELDS)
  const parsed = parseWeddingForm(formData)
  if (!parsed.ok) return { errors: parsed.errors, values }

  const created = await createWedding(getDb(), memberships, orgId, {
    ...parsed.value,
    slugBase: slugFromName(parsed.value.coupleDisplayName),
  })
  if (!created.ok) return { form: 'failed', values }

  revalidatePath('/pro', 'layout')
  redirect(app.wedding(created.value.id))
}
