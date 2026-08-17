import { uuidv7 } from 'uuidv7'

/**
 * Primary keys: `uuid`, generated in the application, time-ordered (UUIDv7).
 *
 * **`uuid` is not negotiable.** Every RLS policy casts
 * `current_setting('app.org_id', true)::uuid`, and
 * research/07-auth-and-tenancy.md section 4a casts `app.user_id::uuid`. Better Auth
 * generates `text` ids by default, so W3 must override that rather than accept it.
 *
 * **Application-side, not `gen_random_uuid()`**, so an insert needs no round-trip to
 * learn the id it just created -- which matters when a single request writes a task
 * and its first comment, or applies a 40-item checklist template in one transaction.
 *
 * **v7, not v4**, so ids sort by creation time. v4 primary keys scatter inserts
 * across the B-tree; v7 keeps them append-ish, which is the difference between a
 * clustered and a fragmented index once a planner has a few thousand tasks. It also
 * makes `order by id` a usable proxy for `order by created_at` in a pinch.
 */
export const newId = (): string => uuidv7()
