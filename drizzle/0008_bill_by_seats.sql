ALTER TABLE "dining_table" ADD COLUMN "bill_by_seats" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Table 29 is not a regular dinner table: two guests who choose it pay for two (owner's rule).
UPDATE "dining_table" SET "bill_by_seats" = false WHERE "number" = 29;
