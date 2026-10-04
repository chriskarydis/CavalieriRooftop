CREATE TYPE "public"."allocation_kind" AS ENUM('HOLD', 'RESERVATION', 'WALK_IN', 'BLOCK');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('REQUIRES_PAYMENT', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."reservation_source" AS ENUM('ONLINE', 'STAFF');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('PENDING_PAYMENT', 'CONFIRMED', 'LATE', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."selection_mode" AS ENUM('AUTO', 'CHOSEN');--> statement-breakpoint
CREATE TYPE "public"."table_shape" AS ENUM('RECT', 'ROUND');--> statement-breakpoint
CREATE TYPE "public"."table_status" AS ENUM('ACTIVE', 'INACTIVE', 'OUT_OF_SERVICE');--> statement-breakpoint
CREATE TYPE "public"."walk_in_kind" AS ENUM('FOOD', 'DRINKS');--> statement-breakpoint
CREATE TYPE "public"."walk_in_status" AS ENUM('SEATED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "allergen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" jsonb NOT NULL,
	CONSTRAINT "allergen_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "closure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "closure_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "combination_pairing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_combination_id" uuid NOT NULL,
	"second_combination_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dining_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer NOT NULL,
	"capacity" integer NOT NULL,
	"max_capacity" integer NOT NULL,
	"category_id" uuid NOT NULL,
	"status" "table_status" DEFAULT 'ACTIVE' NOT NULL,
	"status_reason" text,
	"is_spare" boolean DEFAULT false NOT NULL,
	"online_bookable" boolean DEFAULT true NOT NULL,
	"auto_assignable" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"view_description" jsonb,
	"photo_url" text,
	"notes" text,
	"floor_plan_id" uuid NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"width" real NOT NULL,
	"height" real NOT NULL,
	"rotation" real DEFAULT 0 NOT NULL,
	"shape" "table_shape" DEFAULT 'RECT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dining_table_number_unique" UNIQUE("number"),
	CONSTRAINT "dining_table_capacity_positive" CHECK ("dining_table"."capacity" > 0),
	CONSTRAINT "dining_table_max_capacity" CHECK ("dining_table"."max_capacity" >= "dining_table"."capacity")
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"template" text NOT NULL,
	"recipient" text NOT NULL,
	"locale" text NOT NULL,
	"reservation_id" uuid,
	"provider_id" text,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_log_idempotencyKey_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "floor_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"shapes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"ingredients" jsonb,
	"price_cents" integer,
	"vegetarian" boolean DEFAULT false NOT NULL,
	"vegan" boolean DEFAULT false NOT NULL,
	"spicy" boolean DEFAULT false NOT NULL,
	"signature" boolean DEFAULT false NOT NULL,
	"chef_recommendation" boolean DEFAULT false NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item_allergen" (
	"menu_item_id" uuid NOT NULL,
	"allergen_id" uuid NOT NULL,
	CONSTRAINT "menu_item_allergen_menu_item_id_allergen_id_pk" PRIMARY KEY("menu_item_id","allergen_id")
);
--> statement-breakpoint
CREATE TABLE "menu_item_image" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt" jsonb,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"reservation_id" uuid,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"stripe_payment_intent_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"deposit_cents" integer NOT NULL,
	"table_fee_cents" integer NOT NULL,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"status" "payment_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_stripePaymentIntentId_unique" UNIQUE("stripe_payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "refund" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"stripe_refund_id" text,
	"amount_cents" integer NOT NULL,
	"status" "refund_status" NOT NULL,
	"reason" text NOT NULL,
	"initiated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_stripeRefundId_unique" UNIQUE("stripe_refund_id")
);
--> statement-breakpoint
CREATE TABLE "reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"manage_token_hash" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"party_size" integer NOT NULL,
	"status" "reservation_status" NOT NULL,
	"source" "reservation_source" NOT NULL,
	"selection_mode" "selection_mode" NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"guest_notes" text,
	"staff_notes" text,
	"deposit_per_person_cents" integer NOT NULL,
	"billable_seats" integer NOT NULL,
	"deposit_cents" integer NOT NULL,
	"table_fee_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"credit_toward_bill_cents" integer NOT NULL,
	"table_category_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "reservation_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"from_status" "reservation_status",
	"to_status" "reservation_status" NOT NULL,
	"actor" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"deposit_per_person_cents" integer NOT NULL,
	"min_billable_guests" integer NOT NULL,
	"dining_minutes" integer NOT NULL,
	"block_minutes" integer NOT NULL,
	"grace_minutes" integer NOT NULL,
	"refund_cutoff_hours" integer NOT NULL,
	"hold_minutes" integer NOT NULL,
	"min_online_party" integer NOT NULL,
	"max_online_party" integer NOT NULL,
	"show_menu_prices" boolean NOT NULL,
	"timezone" text NOT NULL,
	"time_slots" jsonb NOT NULL,
	"closed_weekdays" jsonb NOT NULL,
	"season_start" text NOT NULL,
	"season_end" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_settings_single_row" CHECK ("restaurant_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "stripe_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"period" "tstzrange" NOT NULL,
	"kind" "allocation_kind" NOT NULL,
	"reservation_id" uuid,
	"walk_in_id" uuid,
	"expires_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_allocation_hold_expiry" CHECK (("table_allocation"."kind" = 'HOLD') = ("table_allocation"."expires_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "table_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"extra_fee_cents" integer DEFAULT 0 NOT NULL,
	"fee_counts_toward_min_spend" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"color" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_combination" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"capacity" integer NOT NULL,
	"min_party" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"online_bookable" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_combination_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "table_combination_member" (
	"combination_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	CONSTRAINT "table_combination_member_combination_id_table_id_pk" PRIMARY KEY("combination_id","table_id")
);
--> statement-breakpoint
CREATE TABLE "walk_in" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"party_size" integer NOT NULL,
	"kind" "walk_in_kind" NOT NULL,
	"status" "walk_in_status" DEFAULT 'SEATED' NOT NULL,
	"arrived_at" timestamp with time zone NOT NULL,
	"expected_minutes" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "combination_pairing" ADD CONSTRAINT "combination_pairing_first_combination_id_table_combination_id_fk" FOREIGN KEY ("first_combination_id") REFERENCES "public"."table_combination"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combination_pairing" ADD CONSTRAINT "combination_pairing_second_combination_id_table_combination_id_fk" FOREIGN KEY ("second_combination_id") REFERENCES "public"."table_combination"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_table" ADD CONSTRAINT "dining_table_category_id_table_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."table_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_table" ADD CONSTRAINT "dining_table_floor_plan_id_floor_plan_id_fk" FOREIGN KEY ("floor_plan_id") REFERENCES "public"."floor_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_reservation_id_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_category_id_menu_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_allergen" ADD CONSTRAINT "menu_item_allergen_menu_item_id_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_allergen" ADD CONSTRAINT "menu_item_allergen_allergen_id_allergen_id_fk" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergen"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_image" ADD CONSTRAINT "menu_item_image_menu_item_id_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_reservation_id_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_reservation_id_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_event" ADD CONSTRAINT "reservation_event_reservation_id_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_allocation" ADD CONSTRAINT "table_allocation_table_id_dining_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_table"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_allocation" ADD CONSTRAINT "table_allocation_reservation_id_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_allocation" ADD CONSTRAINT "table_allocation_walk_in_id_walk_in_id_fk" FOREIGN KEY ("walk_in_id") REFERENCES "public"."walk_in"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_combination_member" ADD CONSTRAINT "table_combination_member_combination_id_table_combination_id_fk" FOREIGN KEY ("combination_id") REFERENCES "public"."table_combination"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_combination_member" ADD CONSTRAINT "table_combination_member_table_id_dining_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_table"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "combination_pairing_pair" ON "combination_pairing" USING btree ("first_combination_id","second_combination_id");--> statement-breakpoint
CREATE INDEX "customer_email" ON "customer" USING btree ("email");--> statement-breakpoint
CREATE INDEX "reservation_starts_at" ON "reservation" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "reservation_status" ON "reservation" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reservation_event_reservation" ON "reservation_event" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "table_allocation_reservation" ON "table_allocation" USING btree ("reservation_id");