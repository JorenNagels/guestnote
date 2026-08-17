CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target" text,
	"diff" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_role_check" CHECK (role in ('admin', 'member', 'couple', 'editor')),
	CONSTRAINT "invitations_scope_role_check" CHECK ((wedding_id is null and role in ('admin', 'member')) or (wedding_id is not null and role in ('couple', 'editor')))
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_members_org_id_user_id_pk" PRIMARY KEY("org_id","user_id"),
	CONSTRAINT "org_members_role_check" CHECK (role in ('owner', 'admin', 'member'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"brand" jsonb,
	"mollie_customer_id" text,
	"subscription_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "organizations_type_check" CHECK (type in ('planner', 'venue', 'couple_direct'))
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"visibility" text DEFAULT 'shared' NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "task_comments_visibility_check" CHECK (visibility in ('shared', 'internal'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"assignee_user_id" uuid,
	"assignee_role" text,
	"status" text DEFAULT 'open' NOT NULL,
	"visibility" text DEFAULT 'shared' NOT NULL,
	"due_at" timestamp with time zone,
	"due_offset_days" integer,
	"created_by" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tasks_status_check" CHECK (status in ('open', 'in_progress', 'done')),
	CONSTRAINT "tasks_visibility_check" CHECK (visibility in ('shared', 'internal')),
	CONSTRAINT "tasks_assignee_role_check" CHECK (assignee_role in ('planner', 'couple'))
);
--> statement-breakpoint
CREATE TABLE "wedding_domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"wedding_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"kind" text DEFAULT 'subdomain' NOT NULL,
	"cf_tenant_id" text,
	"cert_status" text,
	"verified_at" timestamp with time zone,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wedding_domains_domain_unique" UNIQUE("domain"),
	CONSTRAINT "wedding_domains_kind_check" CHECK (kind in ('subdomain', 'custom'))
);
--> statement-breakpoint
CREATE TABLE "wedding_members" (
	"wedding_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wedding_members_wedding_id_user_id_pk" PRIMARY KEY("wedding_id","user_id"),
	CONSTRAINT "wedding_members_role_check" CHECK (role in ('couple', 'editor'))
);
--> statement-breakpoint
CREATE TABLE "weddings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"couple_display_name" text NOT NULL,
	"couple_names" text[],
	"wedding_date" date,
	"timezone" text DEFAULT 'Europe/Brussels' NOT NULL,
	"locale_default" text DEFAULT 'nl' NOT NULL,
	"locales" text[] DEFAULT array['nl'] NOT NULL,
	"theme" jsonb,
	"published_at" timestamp with time zone,
	"retention_delete_after" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "weddings_status_check" CHECK (status in ('draft', 'live', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_domains" ADD CONSTRAINT "wedding_domains_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_members" ADD CONSTRAINT "wedding_members_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wedding_members" ADD CONSTRAINT "wedding_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weddings" ADD CONSTRAINT "weddings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_org_at_idx" ON "audit_log" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "invitations_org_id_email_idx" ON "invitations" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "org_members_user_id_idx" ON "org_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "task_comments_org_task_idx" ON "task_comments" USING btree ("org_id","task_id");--> statement-breakpoint
CREATE INDEX "tasks_org_wedding_idx" ON "tasks" USING btree ("org_id","wedding_id");--> statement-breakpoint
CREATE INDEX "tasks_org_due_at_idx" ON "tasks" USING btree ("org_id","due_at");--> statement-breakpoint
CREATE INDEX "wedding_domains_wedding_id_idx" ON "wedding_domains" USING btree ("org_id","wedding_id");--> statement-breakpoint
CREATE INDEX "wedding_members_user_id_idx" ON "wedding_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weddings_slug_key" ON "weddings" USING btree ("slug") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "weddings_org_id_idx" ON "weddings" USING btree ("org_id");