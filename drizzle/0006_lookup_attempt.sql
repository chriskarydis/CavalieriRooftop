CREATE TABLE "lookup_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "lookup_attempt_ip_idx" ON "lookup_attempt" USING btree ("ip_hash","created_at");