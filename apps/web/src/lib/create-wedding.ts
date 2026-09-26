import 'server-only'
import { createWedding, type Memberships } from '@guestnote/db'
import { getDb } from './db.ts'
import { slugFromName } from './slug.ts'
import { canCreateWedding, echoValues, type FormState } from './wedding-form-state.ts'
import { parseWeddingForm } from './wedding-parse.ts'

const FIELDS = ['coupleDisplayName', 'weddingDate', 'venue', 'headcount', 'color'] as const

/**
 * A wedding from a posted form: who may, whether the input holds, then the write. Shared by the
 * in-app new-wedding screen and sign-up's first-wedding step (spec 0005: "Step 4 uses the in-app
 * new-wedding code path"), and deliberately without a redirect or a revalidation -- those are
 * each caller's, because the two land in different places.
 *
 * Owner and admin only -- `canCreateWedding` answers with a code the form renders, and
 * `createWedding` refuses a `member` again through the same principal derivation the rest of
 * the app uses, so this check is the sentence and the repo is the gate. The caller has already
 * resolved `memberships` and `orgId`; nothing here reads a session or a cookie.
 */
export async function createWeddingFromForm(
  memberships: Memberships,
  orgId: string,
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; state: FormState }> {
  if (!canCreateWedding(memberships, orgId)) return { ok: false, state: { form: 'forbidden' } }

  const values = echoValues(formData, FIELDS)
  const parsed = parseWeddingForm(formData)
  if (!parsed.ok) return { ok: false, state: { errors: parsed.errors, values } }

  const created = await createWedding(getDb(), memberships, orgId, {
    ...parsed.value,
    slugBase: slugFromName(parsed.value.coupleDisplayName),
  })
  if (!created.ok) return { ok: false, state: { form: 'failed', values } }
  return { ok: true, id: created.value.id }
}
