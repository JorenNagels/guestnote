CREATE TABLE "mail_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"to_email" text NOT NULL,
	"template" text NOT NULL,
	"locale" text NOT NULL,
	"provider_message_id" text,
	"status" text NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"complained_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_deliveries_status_check" CHECK (status in ('sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mail_deliveries_provider_message_id_key" ON "mail_deliveries" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "mail_deliveries_to_email_created_at_idx" ON "mail_deliveries" USING btree ("to_email","created_at");