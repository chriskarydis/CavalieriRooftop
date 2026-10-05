ALTER TABLE "customer" ADD COLUMN "anonymised_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "retention_months" integer;