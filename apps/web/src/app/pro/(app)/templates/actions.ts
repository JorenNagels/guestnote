'use server'

import { createTemplate, templateAccess } from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import { getDb } from '../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../lib/principal.ts'
import { parseTemplateInput, type TemplateActionError } from '../../../../lib/template-input.ts'

/**
 * Creating a template. The other template writes are in `[templateId]/actions.ts`.
 *
 * A Server Function is a POST to its own route, so `(app)/layout.tsx`'s session gate never runs
 * for it (invariant 7). The check is stated three times and none is redundant: `canWrite` here
 * refuses before any query and gives the form a `forbidden` to show, `createTemplate` takes
 * `principalForOrg` (owner and admin only), and the `task_templates` policies refuse in SQL. A
 * member writing the org's templates is the failure a tenancy audit named on 2026-09-21 for the
 * sibling vendor directory, so no single layer is allowed to be the only one.
 *
 * `/pro/templates` is the ROUTE FILE path and not the URL: `revalidatePath` works on the file
 * tree, and `proxy.ts` rewrites `app.guestnote.be/templates` to `/pro/templates`.
 */

export type CreateTemplateResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: TemplateActionError }

export async function createTemplateAction(input: unknown): Promise<CreateTemplateResult> {
  const parsed = parseTemplateInput(input)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const [m, orgId] = await Promise.all([currentMemberships(), currentOrgId()])
  if (!m || !orgId || !templateAccess(m, orgId)?.canWrite) return { ok: false, error: 'forbidden' }

  const r = await createTemplate(getDb(), m, orgId, parsed.input)
  if (!r.ok) return { ok: false, error: r.reason }
  revalidatePath('/pro/templates', 'layout')
  return { ok: true, id: r.value.id }
}
