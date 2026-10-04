ALTER TABLE "reservation" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reservation" ADD COLUMN "hold_expires_at" timestamp with time zone;