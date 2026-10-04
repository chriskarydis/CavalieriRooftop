-- Makes double booking unrepresentable: no two live allocations of the same
-- table may overlap in time. Released rows (cancelled, expired, no-show) are
-- kept for history and excluded from the rule.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "table_allocation"
  ADD CONSTRAINT "table_allocation_no_overlap"
  EXCLUDE USING gist ("table_id" WITH =, "period" WITH &&)
  WHERE ("released_at" IS NULL);
--> statement-breakpoint
ALTER TABLE "table_allocation"
  ADD CONSTRAINT "table_allocation_period_valid"
  CHECK (NOT isempty("period") AND lower_inf("period") = false AND upper_inf("period") = false);
--> statement-breakpoint
CREATE SEQUENCE "reservation_reference_seq" START 1000;
