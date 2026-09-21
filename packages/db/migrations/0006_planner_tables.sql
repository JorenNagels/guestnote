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