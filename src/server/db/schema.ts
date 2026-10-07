import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Database schema. See docs/DATABASE.md.
 *
 * Conventions: money is integer cents; instants are timestamptz (UTC);
 * guest-visible content is stored per locale as { en, el, ... }.
 * Staff user/session tables are added with authentication.
 */

export type LocalizedText = Record<string, string>;

const tstzrange = customType<{ data: string }>({
  dataType: () => "tstzrange",
});

const id = () => uuid().primaryKey().defaultRandom();
const instant = () => timestamp({ withTimezone: true, mode: "date" });
const createdAt = () => instant().notNull().defaultNow();

export const tableStatus = pgEnum("table_status", ["ACTIVE", "INACTIVE", "OUT_OF_SERVICE"]);
export const tableShape = pgEnum("table_shape", ["RECT", "ROUND"]);
export const reservationStatus = pgEnum("reservation_status", [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "LATE",
  "SEATED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "EXPIRED",
]);
export const paymentStatus = pgEnum("payment_status", [
  "REQUIRES_PAYMENT",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
]);
export const refundStatus = pgEnum("refund_status", ["PENDING", "SUCCEEDED", "FAILED"]);
export const allocationKind = pgEnum("allocation_kind", ["HOLD", "RESERVATION", "WALK_IN", "BLOCK"]);
export const selectionMode = pgEnum("selection_mode", ["AUTO", "CHOSEN"]);
export const reservationSource = pgEnum("reservation_source", ["ONLINE", "STAFF"]);
export const walkInKind = pgEnum("walk_in_kind", ["FOOD", "DRINKS"]);
export const walkInStatus = pgEnum("walk_in_status", ["SEATED", "COMPLETED", "CANCELLED"]);

// ── Configuration ───────────────────────────────────────────────────────────

/** Single row (id = 1). */
export const restaurantSettings = pgTable(
  "restaurant_settings",
  {
    id: integer().primaryKey().default(1),
    depositPerPersonCents: integer().notNull(),
    /** A smaller party is billed as this many guests (solo diner pays for two). */
    minBillableGuests: integer().notNull(),
    diningMinutes: integer().notNull(),
    blockMinutes: integer().notNull(),
    graceMinutes: integer().notNull(),
    refundCutoffHours: integer().notNull(),
    holdMinutes: integer().notNull(),
    minOnlineParty: integer().notNull(),
    maxOnlineParty: integer().notNull(),
    showMenuPrices: boolean().notNull(),
    timezone: text().notNull(),
    timeSlots: jsonb().$type<string[]>().notNull(),
    closedWeekdays: jsonb().$type<number[]>().notNull(),
    /** MM-DD, inclusive. */
    seasonStart: text().notNull(),
    seasonEnd: text().notNull(),
    /** Months after a guest's last reservation when their details are erased; null keeps them. */
    retentionMonths: integer(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [check("restaurant_settings_single_row", sql`${t.id} = 1`)],
);

/** One-off closed dates (weather, private event). */
export const closure = pgTable("closure", {
  id: id(),
  /** Service date, YYYY-MM-DD in the restaurant's timezone. */
  date: text().notNull().unique(),
  reason: text(),
  createdAt: createdAt(),
});

// ── Floor ───────────────────────────────────────────────────────────────────

export const tableCategory = pgTable("table_category", {
  id: id(),
  name: jsonb().$type<LocalizedText>().notNull(),
  description: jsonb().$type<LocalizedText>(),
  extraFeeCents: integer().notNull().default(0),
  /** When true the fee is also credited toward the final bill. */
  feeCountsTowardMinSpend: boolean().notNull().default(false),
  priority: integer().notNull().default(0),
  color: text().notNull(),
  displayOrder: integer().notNull().default(0),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
});

export type FloorShape =
  | { type: "rect"; x: number; y: number; width: number; height: number; style: string }
  | { type: "polyline"; points: number[][]; style: string }
  /** rotation in degrees; style "view" marks what guests look at from that side of the terrace. */
  | { type: "label"; x: number; y: number; key: string; rotation?: number; style?: string };

export const floorPlan = pgTable("floor_plan", {
  id: id(),
  name: text().notNull(),
  /** Size of the coordinate space used by table positions and shapes. */
  width: integer().notNull(),
  height: integer().notNull(),
  shapes: jsonb().$type<FloorShape[]>().notNull(),
  createdAt: createdAt(),
});

export const diningTable = pgTable(
  "dining_table",
  {
    id: id(),
    number: integer().notNull().unique(),
    /** Standard seats; a capacity-based minimum spend is billed on this. */
    capacity: integer().notNull(),
    /** Seats with an extra chair added by staff. */
    maxCapacity: integer().notNull(),
    categoryId: uuid()
      .notNull()
      .references(() => tableCategory.id),
    status: tableStatus().notNull().default("ACTIVE"),
    statusReason: text(),
    isSpare: boolean().notNull().default(false),
    onlineBookable: boolean().notNull().default(true),
    autoAssignable: boolean().notNull().default(true),
    /** A smaller party choosing this table pays the minimum spend of its seats. */
    billBySeats: boolean().notNull().default(true),
    priority: integer().notNull().default(0),
    viewDescription: jsonb().$type<LocalizedText>(),
    photoUrl: text(),
    notes: text(),
    floorPlanId: uuid()
      .notNull()
      .references(() => floorPlan.id),
    /** Centre of the table in floor-plan units. */
    x: real().notNull(),
    y: real().notNull(),
    width: real().notNull(),
    height: real().notNull(),
    rotation: real().notNull().default(0),
    shape: tableShape().notNull().default("RECT"),
    createdAt: createdAt(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [
    check("dining_table_capacity_positive", sql`${t.capacity} > 0`),
    check("dining_table_max_capacity", sql`${t.maxCapacity} >= ${t.capacity}`),
  ],
);

export const tableCombination = pgTable("table_combination", {
  id: id(),
  name: text().notNull().unique(),
  /** Configured seats for the joined arrangement; not the sum of members. */
  capacity: integer().notNull(),
  minParty: integer().notNull(),
  active: boolean().notNull().default(true),
  onlineBookable: boolean().notNull().default(true),
  priority: integer().notNull().default(0),
  createdAt: createdAt(),
});

export const tableCombinationMember = pgTable(
  "table_combination_member",
  {
    combinationId: uuid()
      .notNull()
      .references(() => tableCombination.id, { onDelete: "cascade" }),
    tableId: uuid()
      .notNull()
      .references(() => diningTable.id),
  },
  (t) => [primaryKey({ columns: [t.combinationId, t.tableId] })],
);

/** Two combinations that may seat one large party together. */
export const combinationPairing = pgTable(
  "combination_pairing",
  {
    id: id(),
    firstCombinationId: uuid()
      .notNull()
      .references(() => tableCombination.id, { onDelete: "cascade" }),
    secondCombinationId: uuid()
      .notNull()
      .references(() => tableCombination.id, { onDelete: "cascade" }),
    active: boolean().notNull().default(true),
  },
  (t) => [uniqueIndex("combination_pairing_pair").on(t.firstCombinationId, t.secondCombinationId)],
);

// ── Bookings ────────────────────────────────────────────────────────────────

export const customer = pgTable(
  "customer",
  {
    id: id(),
    name: text().notNull(),
    email: text().notNull(),
    phone: text(),
    locale: text().notNull().default("en"),
    marketingConsent: boolean().notNull().default(false),
    notes: text(),
    /** Set when the guest's details were erased under the retention period. */
    anonymisedAt: instant(),
    createdAt: createdAt(),
  },
  (t) => [index("customer_email").on(t.email)],
);

export const reservation = pgTable(
  "reservation",
  {
    id: id(),
    /** Human-readable reference, e.g. CRG-1842. Never sufficient alone to open a reservation. */
    reference: text().notNull().unique(),
    /** SHA-256 of the secret token in the guest's manage link. */
    manageTokenHash: text().notNull(),
    /** Null while the table is held and the guest has not entered their details yet. */
    customerId: uuid().references(() => customer.id),
    /** When the unpaid hold lapses; kept for reference after confirmation. */
    holdExpiresAt: instant(),
    /** Random id from the visitor's browser cookie; lets a new selection replace their previous hold. */
    holderId: text(),
    /** Keyed hash of the visitor's IP address, used only to cap simultaneous holds. */
    holderIpHash: text(),
    startsAt: instant().notNull(),
    partySize: integer().notNull(),
    status: reservationStatus().notNull(),
    source: reservationSource().notNull(),
    selectionMode: selectionMode().notNull(),
    /** The table it has now was given by staff (a move or a change), not picked by the guest. */
    tableSetByStaff: boolean().notNull().default(false),
    locale: text().notNull().default("en"),
    guestNotes: text(),
    staffNotes: text(),
    // Price snapshot taken at booking; later configuration changes never alter it.
    depositPerPersonCents: integer().notNull(),
    billableSeats: integer().notNull(),
    depositCents: integer().notNull(),
    tableFeeCents: integer().notNull(),
    totalCents: integer().notNull(),
    creditTowardBillCents: integer().notNull(),
    tableCategoryName: text(),
    createdAt: createdAt(),
    updatedAt: instant().notNull().defaultNow(),
  },
  (t) => [index("reservation_starts_at").on(t.startsAt), index("reservation_status").on(t.status)],
);

export const walkIn = pgTable("walk_in", {
  id: id(),
  name: text(),
  partySize: integer().notNull(),
  kind: walkInKind().notNull(),
  status: walkInStatus().notNull().default("SEATED"),
  arrivedAt: instant().notNull(),
  expectedMinutes: integer().notNull(),
  notes: text(),
  createdAt: createdAt(),
});

/**
 * Single source of truth for which table is taken when. One row per physical
 * table: a three-table combination writes three rows. A migration adds
 *   EXCLUDE USING gist (table_id WITH =, period WITH &&) WHERE (released_at IS NULL)
 * which makes an overlapping live allocation impossible.
 */
export const tableAllocation = pgTable(
  "table_allocation",
  {
    id: id(),
    tableId: uuid()
      .notNull()
      .references(() => diningTable.id),
    /** Half-open [start, start + block minutes). */
    period: tstzrange().notNull(),
    kind: allocationKind().notNull(),
    reservationId: uuid().references(() => reservation.id),
    walkInId: uuid().references(() => walkIn.id),
    /** Holds only: when the unpaid hold lapses. */
    expiresAt: instant(),
    releasedAt: instant(),
    reason: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("table_allocation_reservation").on(t.reservationId),
    check("table_allocation_hold_expiry", sql`(${t.kind} = 'HOLD') = (${t.expiresAt} IS NOT NULL)`),
  ],
);

export const reservationEvent = pgTable(
  "reservation_event",
  {
    id: id(),
    reservationId: uuid()
      .notNull()
      .references(() => reservation.id),
    fromStatus: reservationStatus(),
    toStatus: reservationStatus().notNull(),
    /** Staff user id, "guest", or "system". */
    actor: text().notNull(),
    reason: text(),
    createdAt: createdAt(),
  },
  (t) => [index("reservation_event_reservation").on(t.reservationId)],
);

// ── Money ───────────────────────────────────────────────────────────────────

export const payment = pgTable("payment", {
  id: id(),
  reservationId: uuid()
    .notNull()
    .references(() => reservation.id),
  stripePaymentIntentId: text().notNull().unique(),
  amountCents: integer().notNull(),
  depositCents: integer().notNull(),
  tableFeeCents: integer().notNull(),
  refundedCents: integer().notNull().default(0),
  status: paymentStatus().notNull(),
  createdAt: createdAt(),
  updatedAt: instant().notNull().defaultNow(),
});

export const refund = pgTable("refund", {
  id: id(),
  paymentId: uuid()
    .notNull()
    .references(() => payment.id),
  stripeRefundId: text().unique(),
  amountCents: integer().notNull(),
  status: refundStatus().notNull(),
  /** POLICY for an in-policy cancellation, otherwise the manager's stated reason. */
  reason: text().notNull(),
  /** Staff user id, or "system". */
  initiatedBy: text().notNull(),
  createdAt: createdAt(),
});

/** Processed Stripe event ids, so webhook retries are idempotent. */
export const stripeEvent = pgTable("stripe_event", {
  id: text().primaryKey(),
  type: text().notNull(),
  processedAt: createdAt(),
});

// ── Menu ────────────────────────────────────────────────────────────────────

/** The restaurant's three printed lists; every menu section belongs to one. */
export const MENU_KEYS = ["FOOD", "BAR", "WINE"] as const;
export type MenuKey = (typeof MENU_KEYS)[number];

export const menuCategory = pgTable("menu_category", {
  id: id(),
  menu: text().$type<MenuKey>().notNull().default("FOOD"),
  name: jsonb().$type<LocalizedText>().notNull(),
  description: jsonb().$type<LocalizedText>(),
  displayOrder: integer().notNull().default(0),
  active: boolean().notNull().default(true),
});

export const menuItem = pgTable("menu_item", {
  id: id(),
  categoryId: uuid()
    .notNull()
    .references(() => menuCategory.id),
  name: jsonb().$type<LocalizedText>().notNull(),
  description: jsonb().$type<LocalizedText>(),
  ingredients: jsonb().$type<LocalizedText>(),
  /** Optional; shown publicly only when settings.showMenuPrices is on. */
  priceCents: integer(),
  vegetarian: boolean().notNull().default(false),
  vegan: boolean().notNull().default(false),
  spicy: boolean().notNull().default(false),
  signature: boolean().notNull().default(false),
  chefRecommendation: boolean().notNull().default(false),
  available: boolean().notNull().default(true),
  active: boolean().notNull().default(true),
  displayOrder: integer().notNull().default(0),
  createdAt: createdAt(),
  updatedAt: instant().notNull().defaultNow(),
});

export const menuItemImage = pgTable("menu_item_image", {
  id: id(),
  menuItemId: uuid()
    .notNull()
    .references(() => menuItem.id, { onDelete: "cascade" }),
  url: text().notNull(),
  alt: jsonb().$type<LocalizedText>(),
  displayOrder: integer().notNull().default(0),
});

export const allergen = pgTable("allergen", {
  id: id(),
  code: text().notNull().unique(),
  name: jsonb().$type<LocalizedText>().notNull(),
});

export const menuItemAllergen = pgTable(
  "menu_item_allergen",
  {
    menuItemId: uuid()
      .notNull()
      .references(() => menuItem.id, { onDelete: "cascade" }),
    allergenId: uuid()
      .notNull()
      .references(() => allergen.id),
  },
  (t) => [primaryKey({ columns: [t.menuItemId, t.allergenId] })],
);

// ── System ──────────────────────────────────────────────────────────────────

export const notification = pgTable("notification", {
  id: id(),
  type: text().notNull(),
  reservationId: uuid().references(() => reservation.id),
  payload: jsonb().$type<Record<string, unknown>>().notNull(),
  readAt: instant(),
  createdAt: createdAt(),
});

/** Attempts to open a reservation by its number, kept for a day to limit guessing. No guest data. */
export const lookupAttempt = pgTable(
  "lookup_attempt",
  {
    id: id(),
    /** Keyed hash of the visitor's network address, never the address itself. */
    ipHash: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("lookup_attempt_ip_idx").on(t.ipHash, t.createdAt)],
);

export const emailLog = pgTable(
  "email_log",
  {
    id: id(),
    /** Unique per (reservation, template, event) so retries cannot send twice. */
    idempotencyKey: text().notNull().unique(),
    template: text().notNull(),
    recipient: text().notNull(),
    locale: text().notNull(),
    reservationId: uuid().references(() => reservation.id),
    providerId: text(),
    status: text().notNull(),
    error: text(),
    createdAt: createdAt(),
  },
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    /** Staff user id, "guest", or "system". */
    actor: text().notNull(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_entity").on(t.entityType, t.entityId)],
);

// ── Staff authentication (Better Auth) ──────────────────────────────────────

export const staffRole = pgEnum("staff_role", ["MANAGER", "DEVELOPER"]);

export const staffUser = pgTable("staff_user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  role: staffRole().notNull().default("MANAGER"),
  createdAt: createdAt(),
  updatedAt: instant().notNull().defaultNow(),
});

export const staffSession = pgTable("staff_session", {
  id: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => staffUser.id, { onDelete: "cascade" }),
  token: text().notNull().unique(),
  expiresAt: instant().notNull(),
  ipAddress: text(),
  userAgent: text(),
  createdAt: createdAt(),
  updatedAt: instant().notNull().defaultNow(),
});

/** Credential record; the password column holds the hash, never the password. */
export const staffAccount = pgTable("staff_account", {
  id: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => staffUser.id, { onDelete: "cascade" }),
  accountId: text().notNull(),
  providerId: text().notNull(),
  password: text(),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: instant(),
  refreshTokenExpiresAt: instant(),
  scope: text(),
  createdAt: createdAt(),
  updatedAt: instant().notNull().defaultNow(),
});

export const staffVerification = pgTable("staff_verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: instant().notNull(),
  createdAt: createdAt(),
  updatedAt: instant().notNull().defaultNow(),
});

export const authRateLimit = pgTable("auth_rate_limit", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

export type ReservationStatusValue = (typeof reservationStatus.enumValues)[number];
