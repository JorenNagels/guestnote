-- Spec 0004: a task can count from an event, and a run-sheet row can have a staff owner.
--
-- Two nullable columns on tables already classified and already under FORCE RLS, so no bucket
-- change and no policy: `tasks.tenant_isolation` (0001) and `run_sheet_items`' policies (0006,
-- 0008) cover the new columns as they cover the rows. Two consequences worth stating:
--
-- * `anchor_event_id` points at `wedding_events`, which a couple cannot read (0006). A couple
--   reading a shared anchored task therefore cannot resolve the anchor; the repo keeps
--   `due_at` current on every date write, and that is what a couple reader must use.
-- * `run_sheet_items.link_read` (0008) grants a vendor link the whole row, so a signed link can
--   read `owner_user_id`. An opaque uuid; the vendor page never selects it (spec 0004).
--
-- The foreign keys are plain, as every FK between planner tables is (spec 0003): the repo reads
-- the anchor event and checks the owner under `withTenant` before writing either.
ALTER TABLE "run_sheet_items" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "anchor_event_id" uuid;--> statement-breakpoint
ALTER TABLE "run_sheet_items" ADD CONSTRAINT "run_sheet_items_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_anchor_event_id_wedding_events_id_fk" FOREIGN KEY ("anchor_event_id") REFERENCES "public"."wedding_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_org_anchor_event_idx" ON "tasks" USING btree ("org_id","anchor_event_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_anchor_needs_offset" CHECK (anchor_event_id is null or due_offset_days is not null);
