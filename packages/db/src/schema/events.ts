import { sql } from 'drizzle-orm'
import { check, date, index, integer, pgTable, text, time, uuid } from 'drizzle-orm/pg-core'
import { createdAt, deletedAt, orgId, updatedAt, weddingId } from './_shared.ts'
import { weddingVendors } from './vendors.ts'
import { weddings } from './weddings.ts'

/**
 * One row per event of a wedding: the civil ceremony on Friday, the party on Saturday, the
 * brunch on Sunday. Spec 0003 chose a table over `jsonb` because run sheet items hang off
 * an event and need a foreign key.
 *
 * `weddings.wedding_date` stays the MAIN date and is what `tasks.due_offset_days` resolves
 * against, so nothing about tasks changes. Which event row is "the main one" is not stored:
 * the date of the wedding is `weddings.wedding_date`, and an event on that date is it.
 *
 * `starts_on` is a `date` for the same reason `wedding_date` is: a local civil date. And
 * `starts_at` is a bare `time` -- a wall-clock hour with no zone, resolved against
 * `weddings.timezone` -- not a `timestamptz`, because "the ceremony is at 15:30" must not
 * move when the wedding date is edited.
 */
export const weddingEvents = pgTable(
  'wedding_events',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId(),
    weddingId: weddingId().references(() => weddings.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    startsOn: date('starts_on').notNull(),
    startsAt: time('starts_at'),
    venue: text('venue'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('wedding_events_org_wedding_idx').on(t.orgId, t.weddingId, t.startsOn)],
)

/**
 * One line of an event's run sheet.
 *
 * `starts_at` is a bare `time`, and that has a consequence worth stating: a run sheet that
 * runs past midnight ("01:30 last dance" after "21:00 first dance") cannot be ordered by
 * `starts_at`, because 01:30 sorts first. `position` is the order and `starts_at` is the
 * label -- the application assigns `position`, and nothing here derives one from the other.
 *
 * `wedding_vendor_id` is `set null`, not `cascade`: removing a vendor from a wedding must
 * not delete the rows of the day's schedule that mentioned them.
 */
export const runSheetItems = pgTable(
  'run_sheet_items',
  {
    id: uuid('id').primaryKey(),
    orgId: orgId(),
    weddingId: weddingId().references(() => weddings.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => weddingEvents.id, { onDelete: 'cascade' }),
    startsAt: time('starts_at').notNull(),
    durationMin: integer('duration_min').notNull(),
    title: text('title').notNull(),
    place: text('place'),
    weddingVendorId: uuid('wedding_vendor_id').references(() => weddingVendors.id, {
      onDelete: 'set null',
    }),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('run_sheet_items_duration_check', sql.raw('duration_min > 0')),
    index('run_sheet_items_org_event_idx').on(t.orgId, t.eventId, t.position),
  ],
)
