CREATE TABLE "waiting_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" text NOT NULL,
	"time" text NOT NULL,
	"party_size" integer NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"status" text DEFAULT 'WAITING' NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservation" ADD COLUMN "occasion" text;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "review_url_google" text;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "review_url_tripadvisor" text;--> statement-breakpoint
CREATE INDEX "waiting_entry_date" ON "waiting_entry" USING btree ("date");