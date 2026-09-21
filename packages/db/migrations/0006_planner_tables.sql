CREATE TABLE "run_sheet_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"starts_at" time NOT NULL,
	"duration_min" integer NOT NULL,
	"title" text NOT NULL,
	"place" text,
	"wedding_vendor_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_sheet_items_duration_check" CHECK (duration_min > 0)
);
--> statement-breakpoint
CREATE TABLE "wedding_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid NOT NULL,
	"label" text NOT NULL,
	"starts_on" date NOT NULL,
	"starts_at" time,
	"venue" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid NOT NULL,
	"kind" text DEFAULT 'file' NOT NULL,
	"name" text NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"mime" text NOT NULL,
	"visibility" text DEFAULT 'shared' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "files_kind_check" CHECK (kind in ('file', 'image')),
	CONSTRAINT "files_visibility_check" CHECK (visibility in ('shared', 'internal')),
	CONSTRAINT "files_size_check" CHECK (size_bytes >= 0)
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"estimate_cents" integer NOT NULL,
	"actual_cents" integer,
	"wedding_vendor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "budget_lines_estimate_check" CHECK (estimate_cents >= 0),
	CONSTRAINT "budget_lines_actual_check" CHECK (actual_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid NOT NULL,
	"budget_line_id" uuid NOT NULL,
	"due_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_check" CHECK (amount_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "template_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_offset_days" integer NOT NULL,
	"visibility" text DEFAULT 'shared' NOT NULL,
	"assignee_role" text DEFAULT 'planner' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_items_visibility_check" CHECK (visibility in ('shared', 'internal')),
	CONSTRAINT "template_items_assignee_role_check" CHECK (assignee_role in ('planner', 'couple'))
);
--> statement-breakpoint
CREATE TABLE "vendor_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid NOT NULL,
	"wedding_vendor_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"email" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wedding_vendors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"status" text DEFAULT 'considering' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "wedding_vendors_status_check" CHECK (status in ('considering', 'contacted', 'quoted', 'booked', 'declined'))
);
--> statement-breakpoint
ALTER TABLE "weddings" ADD COLUMN "venue" text;--> statement-breakpoint
ALTER TABLE "weddings" ADD COLUMN "headcount" integer;--> statement-breakpoint
ALTER TABLE "weddings" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "weddings" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "run_sheet_items" ADD CONSTRAINT "run_sheet_items_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_sheet_items" ADD CONSTRAINT "run_sheet_items_event_id_wedding_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."wedding_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_sheet_items" ADD CONSTRAINT "run_sheet_items_wedding_vendor_id_wedding_vendors_id_fk" FOREIGN KEY ("wedding_vendor_id") REFERENCES "public"."wedding_vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_events" ADD CONSTRAINT "wedding_events_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_wedding_vendor_id_wedding_vendors_id_fk" FOREIGN KEY ("wedding_vendor_id") REFERENCES "public"."wedding_vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_budget_line_id_budget_lines_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."budget_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_items" ADD CONSTRAINT "template_items_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_links" ADD CONSTRAINT "vendor_links_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_links" ADD CONSTRAINT "vendor_links_wedding_vendor_id_wedding_vendors_id_fk" FOREIGN KEY ("wedding_vendor_id") REFERENCES "public"."wedding_vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_vendors" ADD CONSTRAINT "wedding_vendors_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_vendors" ADD CONSTRAINT "wedding_vendors_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_sheet_items_org_event_idx" ON "run_sheet_items" USING btree ("org_id","event_id","position");--> statement-breakpoint
CREATE INDEX "wedding_events_org_wedding_idx" ON "wedding_events" USING btree ("org_id","wedding_id","starts_on");--> statement-breakpoint
CREATE UNIQUE INDEX "files_org_storage_key_key" ON "files" USING btree ("org_id","storage_key");--> statement-breakpoint
CREATE INDEX "files_org_wedding_idx" ON "files" USING btree ("org_id","wedding_id");--> statement-breakpoint
CREATE INDEX "budget_lines_org_wedding_idx" ON "budget_lines" USING btree ("org_id","wedding_id");--> statement-breakpoint
CREATE INDEX "payments_org_wedding_due_idx" ON "payments" USING btree ("org_id","wedding_id","due_on");--> statement-breakpoint
CREATE INDEX "payments_org_budget_line_idx" ON "payments" USING btree ("org_id","budget_line_id");--> statement-breakpoint
CREATE INDEX "task_templates_org_idx" ON "task_templates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "template_items_org_template_idx" ON "template_items" USING btree ("org_id","template_id","position");--> statement-breakpoint
CREATE INDEX "vendor_links_org_wedding_idx" ON "vendor_links" USING btree ("org_id","wedding_id");--> statement-breakpoint
CREATE INDEX "vendors_org_name_idx" ON "vendors" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "wedding_vendors_wedding_vendor_key" ON "wedding_vendors" USING btree ("wedding_id","vendor_id") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "wedding_vendors_org_wedding_idx" ON "wedding_vendors" USING btree ("org_id","wedding_id");--> statement-breakpoint
ALTER TABLE "weddings" ADD CONSTRAINT "weddings_headcount_check" CHECK (headcount >= 0);--> statement-breakpoint
ALTER TABLE "weddings" ADD CONSTRAINT "weddings_color_check" CHECK (color ~ '^#[0-9A-F]{6}$');
--> statement-breakpoint

-- Row Level Security and grants for the ten tables created above (spec 0003, slice F1).
--
-- Everything from here down is hand-written, for the reason 0001_rls.sql gives: `CREATE
-- POLICY` is the SQL you most want to be able to read six months from now, and keeping
-- drizzle-kit out of the policy business means it can never produce a diff that quietly
-- drops one. drizzle-kit wrote the DDL above; it does not read or rewrite this part.
--
-- ## Why this is the tail of 0006 and not a 0007 of its own
--
-- It was a separate file until 2026-09-21. deploy.yml applies each file in its own
-- transaction, so a failure between the two would have left ten tables with the default
-- DML grants (0002's `alter default privileges`) and NO row level security -- open to
-- `app_user`, in staging, with no error anywhere. One file is one transaction, so the
-- tables and their policies now arrive together or not at all. The cost is that a policy
-- change to one of these tables is a new migration, as it would have been, and this file
-- is longer than the ones drizzle-kit writes. Nothing had been applied to Neon when the two
-- were merged, which is the only reason a numbered file could be rewritten.
--
-- ## The rule every policy here carries: a `couple` reads none of it
--
-- spec 0003: "Until then no new table is readable by a `couple` principal. Every new policy
-- excludes `app.wedding_role = 'couple'`." A couple has no org, so they need a read path and
-- invite sending that do not exist yet, and until they do nothing here has a reason to admit
-- them. The tenant keys alone cannot do this: research/07-auth-and-tenancy.md section 3
-- makes a couple's GUCs and a planner's GUCs IDENTICAL, so `app.org_id` and `app.wedding_id`
-- match for a couple on their own wedding and the row would be returned. The role clause is
-- the only thing that tells them apart -- the same argument as `tasks.visibility`.
--
-- It is written as a POSITIVE list, not `<> 'couple'`:
--
--     nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
--
--   * An unset role is NULL, so the row is filtered. Fails closed, like everything else here.
--   * `editor` is out too. spec 0003's permissions table gives `editor` none of these
--     screens "in this build", and a negative test would have admitted them by omission.
--     Cost: admitting `editor` later is a new migration, not a one-line app change. That is
--     the price of the list being the whole truth.
--
-- The narrower "who may WRITE" question is answered in SQL for exactly two groups:
-- `vendor_links` (below, because it mints access) and the three org-scoped tables `vendors`,
-- `task_templates`, `template_items`, where spec 0003's permissions table says a `member`
-- reads and only owner and admin write. On the seven wedding-scoped tables a `member` reads
-- and writes their own wedding (spec 0003: "assigned weddings only"), so there is nothing
-- narrower to say and the Server Function does not need a second rule.
-- (This section first left the org-scoped write rule to the action. A tenancy audit
-- 2026-09-21 objected: an action that forgets the check is a member editing the org's
-- vendor directory, and a rule the database can hold does not need to be remembered.)
--
-- ## Wedding-scoped: seven tables
--
-- Both keys, exactly the shape 0001 gives `invitations`: `org_id` always, `wedding_id` only
-- where the principal is pinned to one (`assignedStaff`, `weddingMember`). An org-wide
-- `orgStaff` leaves `app.wedding_id` unset and reads the whole org.
--
-- ## Org-scoped: three tables
--
-- `vendors`, `task_templates`, `template_items` carry `org_id` and no `wedding_id`. Their
-- policies are `org_id` plus the role clause -- and note they do NOT narrow a pinned `member`
-- to one wedding, because there is no wedding on the row to narrow by. A member reads the
-- org's whole directory, which is what spec 0003 says.
--
-- Two policies each, because reads and writes admit different roles and `FOR ALL` cannot
-- say so: `tenant_isolation` (FOR ALL) admits owner and admin, and `member_read` (FOR SELECT)
-- adds `member`. Postgres ORs permissive policies, so a SELECT admits all three and an
-- INSERT, UPDATE or DELETE admits the first two only. The alternative, one FOR ALL policy
-- with a wider USING and a narrower WITH CHECK, was rejected: WITH CHECK does not apply to
-- DELETE, so a `member` could still delete every vendor. Cost: two policies to keep in step
-- on three tables; the isolation test pins both directions.
--
-- ## Visibility, on `files` and `template_items`
--
-- Both carry `visibility` (`shared|internal`), so `schema-coverage.test.ts` requires their
-- policy to test `app.wedding_role`, and the role clause above already does. The second,
-- `visibility = 'shared' or role in (... 'editor')`, clause is REDUNDANT today: every role
-- the first clause admits is also one that sees internal rows. It is there so that the day
-- the couple spec adds `couple` to the first list, an internal file does not become
-- readable as a side effect. Two independent clauses, either of which alone keeps a couple
-- out of an internal row -- the same property `tasks` has, and the reason to pay for a
-- clause that decides nothing yet.
--
-- ## `vendor_links`: owner and admin only, reads included
--
-- It holds the hash of a bearer token and its expiry. A `member` has no reason to read
-- either, and "written by owner or admin only" (spec 0003) is enforced here rather than
-- left to the action, because a wrongly-permitted write is a minted credential. The `link`
-- principal and the SECURITY DEFINER lookup that reads a token are S10's, with their own
-- policy set and their own tenancy audit; this migration adds none of it.
--
-- ## Known, and deliberately not fixed here
--
-- `weddings` gained `notes`, `venue`, `headcount`, `color` in 0006. Its policy is 0001's and
-- is unchanged: it admits a `couple` to their own wedding row, whole. So `weddings.notes`,
-- which is the planner's own, becomes couple-readable the day a couple reaches that table.
-- Nothing can today. The couple-portal spec has to answer it (column-level grants, or a
-- separate table) before it ships; changing who reads `weddings` is not F1's decision.

-- ---------------------------------------------------------------------------
-- Enable AND force. ENABLE alone exempts the table owner; see 0001.
-- ---------------------------------------------------------------------------
alter table "wedding_events"   enable row level security;
alter table "wedding_events"   force  row level security;
alter table "budget_lines"     enable row level security;
alter table "budget_lines"     force  row level security;
alter table "payments"         enable row level security;
alter table "payments"         force  row level security;
alter table "wedding_vendors"  enable row level security;
alter table "wedding_vendors"  force  row level security;
alter table "run_sheet_items"  enable row level security;
alter table "run_sheet_items"  force  row level security;
alter table "files"            enable row level security;
alter table "files"            force  row level security;
alter table "vendor_links"     enable row level security;
alter table "vendor_links"     force  row level security;
alter table "vendors"          enable row level security;
alter table "vendors"          force  row level security;
alter table "task_templates"   enable row level security;
alter table "task_templates"   force  row level security;
alter table "template_items"   enable row level security;
alter table "template_items"   force  row level security;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Wedding-scoped, no visibility column.
-- ---------------------------------------------------------------------------
create policy tenant_isolation on "wedding_events"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  );
--> statement-breakpoint

create policy tenant_isolation on "budget_lines"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  );
--> statement-breakpoint

create policy tenant_isolation on "payments"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  );
--> statement-breakpoint

create policy tenant_isolation on "wedding_vendors"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  );
--> statement-breakpoint

create policy tenant_isolation on "run_sheet_items"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Wedding-scoped, with a visibility column. See the header: the second clause decides
-- nothing today and is the one that keeps `internal` rows internal when `couple` is added.
-- ---------------------------------------------------------------------------
create policy tenant_isolation on "files"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
    and (
      visibility = 'shared'
      or nullif(current_setting('app.wedding_role', true), '')
           in ('owner', 'admin', 'member', 'editor')
    )
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin', 'member')
    and (
      visibility = 'shared'
      or nullif(current_setting('app.wedding_role', true), '')
           in ('owner', 'admin', 'member', 'editor')
    )
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- vendor_links: owner and admin, reads and writes.
-- ---------------------------------------------------------------------------
create policy tenant_isolation on "vendor_links"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and (
      nullif(current_setting('app.wedding_id', true), '') is null
      or wedding_id = nullif(current_setting('app.wedding_id', true), '')::uuid
    )
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin')
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Org-scoped: `org_id` and the role clause, no wedding key. Owner and admin read and write
-- (`tenant_isolation`); `member` reads only (`member_read`). See the header.
-- ---------------------------------------------------------------------------
create policy tenant_isolation on "vendors"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin')
  );
--> statement-breakpoint

create policy member_read on "vendors"
  for select
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') = 'member'
  );
--> statement-breakpoint

create policy tenant_isolation on "task_templates"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin')
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin')
  );
--> statement-breakpoint

create policy member_read on "task_templates"
  for select
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') = 'member'
  );
--> statement-breakpoint

create policy tenant_isolation on "template_items"
  for all
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin')
    and (
      visibility = 'shared'
      or nullif(current_setting('app.wedding_role', true), '')
           in ('owner', 'admin', 'member', 'editor')
    )
  )
  with check (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') in ('owner', 'admin')
    and (
      visibility = 'shared'
      or nullif(current_setting('app.wedding_role', true), '')
           in ('owner', 'admin', 'member', 'editor')
    )
  );
--> statement-breakpoint

create policy member_read on "template_items"
  for select
  using (
    org_id = nullif(current_setting('app.org_id', true), '')::uuid
    and nullif(current_setting('app.wedding_role', true), '') = 'member'
    and (
      visibility = 'shared'
      or nullif(current_setting('app.wedding_role', true), '')
           in ('owner', 'admin', 'member', 'editor')
    )
  );
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Grants. 0002's `alter default privileges` already covers a table created by the role
-- that ran it, which is how 0004's mail tables were reached with no grant work. Stated
-- again here, explicitly, because a default privilege silently does nothing when a later
-- migration is applied by a DIFFERENT role than 0002 was -- and the symptom is `permission
-- denied` at runtime, in staging, on the first request. Idempotent; grants to `app_user`
-- and nothing else, and no DDL rights, exactly as 0002.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  "wedding_events", "budget_lines", "payments", "wedding_vendors", "run_sheet_items",
  "files", "vendor_links", "vendors", "task_templates", "template_items"
  to app_user;
