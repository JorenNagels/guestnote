'use server'

import {
  createWeddingEvent,
  deleteWeddingEvent,
  updateWedding,
  updateWeddingEvent,
} from '@guestnote/db'
import { revalidatePath } from 'next/cache'
import { getDb } from '../../../../../../lib/db.ts'
import { currentMemberships, currentOrgId } from '../../../../../../lib/principal.ts'
import { isUuid } from '../../../../../../lib/uuid.ts'
import { echoValues, type FormState } from '../../../../../../lib/wedding-form-state.ts'
import { parseEventForm, parseWeddingForm } from '../../../../../../lib/wedding-parse.ts'

const WEDDING_FIELDS = [
  'coupleDisplayName',
  'weddingDate',
  'venue',
  'headcount',
  'notes',
  'color',
  'status',
] as const
const EVENT_FIELDS = ['label', 'startsOn', 'startsAt', 'venue'] as const

/**
 * Both functions take the wedding id as a bound argument and check standing themselves. The id
 * came from the client, so it is an assertion: the repo derives the principal from memberships
 * and RLS decides, and "no such wedding" and "not yours" both come back as `forbidden`, which the
 * form renders as one sentence -- the same indistinguishability the pages give with a 404.
 *
 * Revalidates the whole `/pro` layout: the sidebar shows this wedding's name, date and colour.
 */
export async function updateWeddingAction(
  weddingId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const [memberships, orgId] = await Promise.all([currentMemberships(), currentOrgId()])
  if (!memberships || !orgId || !isUuid(weddingId)) return { form: 'forbidden' }

  const values = echoValues(formData, WEDDING_FIELDS)
  const parsed = parseWeddingForm(formData)
  if (!parsed.ok) return { errors: parsed.errors, values }

  const saved = await updateWedding(getDb(), memberships, orgId, weddingId, parsed.value)
  if (!saved.ok) return { form: 'forbidden', values }

  revalidatePath('/pro', 'layout')
  return { notice: 'saved' }
}

/**
 * One function for the three things an event row does -- add, save, remove -- chosen by the
 * pressed button's `intent`. Separate functions would each repeat the membership and id checks,
 * and a row is one `<form>` so it has one action. An empty `eventId` is the blank add row.
 *
 * Removing is a soft delete (`deleteWeddingEvent`), so a run sheet item keeps its event.
 */
export async function saveEventAction(
  weddingId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const [memberships, orgId] = await Promise.all([currentMemberships(), currentOrgId()])
  if (!memberships || !orgId || !isUuid(weddingId)) return { form: 'forbidden' }

  const eventIdRaw = formData.get('eventId')
  const eventId = typeof eventIdRaw === 'string' ? eventIdRaw : ''
  if (eventId !== '' && !isUuid(eventId)) return { form: 'forbidden' }

  if (formData.get('intent') === 'remove') {
    if (eventId === '') return {}
    const removed = await deleteWeddingEvent(getDb(), memberships, orgId, weddingId, eventId)
    if (!removed.ok) return { form: 'forbidden' }
    revalidatePath('/pro', 'layout')
    return { notice: 'removed' }
  }

  const values = echoValues(formData, EVENT_FIELDS)
  const parsed = parseEventForm(formData)
  if (!parsed.ok) return { errors: parsed.errors, values }

  const saved =
    eventId === ''
      ? await createWeddingEvent(getDb(), memberships, orgId, weddingId, parsed.value)
      : await updateWeddingEvent(getDb(), memberships, orgId, weddingId, eventId, parsed.value)
  if (!saved.ok) return { form: 'forbidden', values }

  revalidatePath('/pro', 'layout')
  return { notice: 'saved' }
}
