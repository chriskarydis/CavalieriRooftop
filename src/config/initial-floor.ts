/**
 * Initial restaurant configuration, used by the database seed and by tests.
 * After seeding, the database is the source of truth and the manager edits
 * everything here from the dashboard; application code must not import this
 * file at runtime.
 *
 * Coordinates are in the floor plan's own unit space (FLOOR_PLAN.width x
 * FLOOR_PLAN.height), traced from the owner's reference sketch. x/y are the
 * centre of each table. They are approximate and meant to be corrected in the
 * floor-plan editor.
 */

export const DEFAULT_SETTINGS = {
  depositPerPersonCents: 3000,
  minBillableGuests: 2,
  diningMinutes: 120,
  blockMinutes: 150,
  graceMinutes: 15,
  refundCutoffHours: 24,
  holdMinutes: 10,
  minOnlineParty: 1,
  maxOnlineParty: 16,
  showMenuPrices: false,
  timezone: "Europe/Athens",
  timeSlots: [
    "18:30", "19:00", "19:30", "20:00", "20:30", "21:00",
    "21:30", "22:00", "22:30", "23:00", "23:30",
  ],
  /** ISO weekdays the restaurant is closed (1 = Monday). */
  closedWeekdays: [1],
  seasonStart: "05-01",
  seasonEnd: "10-10",
  /** Guests' details are erased this long after their last reservation (owner: five years). */
  retentionMonths: 60,
  /**
   * Where the thank-you email sends guests to leave a review; editable at /manage/settings.
   * The Tripadvisor address is the owner's. The Google one is Google's own "write a review"
   * address for the restaurant's listing (not the hotel's), checked by the owner.
   */
  reviewUrlGoogle: "https://search.google.com/local/writereview?placeid=ChIJC0JZpd1dWxMRakNjp9a4gD4",
  reviewUrlTripadvisor: "https://www.tripadvisor.com.gr/UserReviewEdit-g189458-d4363305-Cavalieri_Roof_Garden-Corfu_Ionian_Islands.html",
} as const;

export type CategoryKey = "STANDARD" | "BEST_FOR_TWO" | "PREFERRED" | "PREMIUM";

export const CATEGORIES: ReadonlyArray<{
  key: CategoryKey;
  name: { en: string; el: string };
  feeCents: number;
  priority: number;
  color: string;
}> = [
  { key: "STANDARD", name: { en: "Standard", el: "Standard" }, feeCents: 0, priority: 0, color: "#8FA3AD" },
  { key: "BEST_FOR_TWO", name: { en: "Best for Two", el: "Ιδανικό για δύο" }, feeCents: 1000, priority: 1, color: "#C98B6B" },
  { key: "PREFERRED", name: { en: "Preferred", el: "Preferred" }, feeCents: 2000, priority: 2, color: "#D9A441" },
  { key: "PREMIUM", name: { en: "Premium", el: "Premium" }, feeCents: 5000, priority: 3, color: "#B4532A" },
];

export const FLOOR_PLAN = {
  name: "Roof Garden",
  width: 1233,
  height: 2000,
  shapes: [
    { type: "rect", x: 45, y: 50, width: 1145, height: 1905, style: "boundary" },
    // Walls of the service block. Every line ends exactly where it meets another.
    { type: "polyline", points: [[45, 698], [690, 698], [690, 1545], [402, 1545], [402, 1777], [218, 1777], [218, 698]], style: "wall" },
    { type: "polyline", points: [[218, 813], [690, 813]], style: "wall" },
    { type: "polyline", points: [[540, 813], [540, 1545]], style: "wall" },
    // In the middle of its room and set smaller, so the longer Greek word stays clear of the walls.
    { type: "label", x: 131, y: 810, key: "toilets", style: "narrow" },
    { type: "label", x: 445, y: 753, key: "entrance" },
    { type: "label", x: 330, y: 1206, key: "kitchen" },
    { type: "label", x: 615, y: 1157, key: "bar" },
    // What guests look at from each side of the terrace, written outside the parapet.
    { type: "label", x: 617, y: 34, key: "viewTop", style: "view" },
    { type: "label", x: 617, y: 1989, key: "viewBottom", style: "view" },
    { type: "label", x: 22, y: 1002, key: "viewLeft", style: "view", rotation: -90 },
    { type: "label", x: 1212, y: 1002, key: "viewRight", style: "view", rotation: 90 },
  ],
} as const;

export interface InitialTable {
  number: number;
  capacity: number;
  /** Seats with an extra chair added by staff; defaults to capacity. */
  maxCapacity?: number;
  category: CategoryKey;
  shape: "RECT" | "ROUND";
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees. A square table turned a quarter has its chairs at the sides instead of top and bottom. */
  rotation?: number;
  /** Defaults: active, online bookable, auto-assignable, not spare. */
  status?: "ACTIVE" | "INACTIVE";
  onlineBookable?: boolean;
  autoAssignable?: boolean;
  /** Defaults to true; see DomainTable.billBySeats. */
  billBySeats?: boolean;
  /** What guests look at from this table, shown when they choose it. */
  view?: { en: string; el: string };
  isSpare?: boolean;
  notes?: string;
}

// One size per kind of table: every table for two is the same square and every
// table for four the same rectangle, standing upright or lying on its side.
const tall = { shape: "RECT", width: 76, height: 140 } as const;
const wide = { shape: "RECT", width: 140, height: 76 } as const;
const square = { shape: "RECT", width: 90, height: 90 } as const;
/** A table for two whose guests sit left and right. */
const sideways = { ...square, rotation: 90 } as const;

// Kept short and plain at the owner's request: which row, then what you see.
const FRONT = {
  en: "Front-row table. View of the Old Fortress and the sea.",
  el: "Τραπέζι 1ης σειράς. Θέα στο Παλαιό Φρούριο και τη θάλασσα.",
};
const FRONT_LEFT = {
  en: "Front-row corner table. View of the Old Fortress, the sea and the Old Town.",
  el: "Τραπέζι 1ης σειράς, γωνιακό. Θέα στο Παλαιό Φρούριο, τη θάλασσα και την Παλιά Πόλη.",
};
const FRONT_RIGHT = {
  en: "Front-row corner table. View of the Old Fortress, the sea and Garitsa bay.",
  el: "Τραπέζι 1ης σειράς, γωνιακό. Θέα στο Παλαιό Φρούριο, τη θάλασσα και τον κόλπο της Γαρίτσας.",
};
const SECOND = {
  en: "Second-row table. View of the Old Fortress and the sea.",
  el: "Τραπέζι 2ης σειράς. Θέα στο Παλαιό Φρούριο και τη θάλασσα.",
};
const TOWN = {
  en: "Table at the edge of the terrace. View of the Old Town.",
  el: "Τραπέζι στην άκρη της ταράτσας. Θέα στην Παλιά Πόλη.",
};
const BAY = {
  en: "Table at the edge of the terrace. View of Garitsa bay and the sea.",
  el: "Τραπέζι στην άκρη της ταράτσας. Θέα στον κόλπο της Γαρίτσας και τη θάλασσα.",
};

// The grid the tables stand on, so that gaps are even. Columns A to E run across
// the top of the terrace; F, G and E are the three columns beside the bar.
const A = 128, B = 368, C = 608, D = 847, E = 1087;
const F = 793, G = 940;
const ROW = { premium: 148, two: 306, twoBehind: 439, wall: 597 } as const;
// The right-hand column from table 11 down to table 23, evenly spaced.
const RIGHT = [362, 543, 725, 907, 1095, 1291, 1487, 1682, 1871] as const;

export const SPARE_TABLE_NUMBER = 99;

export const TABLES: readonly InitialTable[] = [
  { number: 1, capacity: 4, maxCapacity: 5, category: "PREMIUM", ...tall, x: A, y: ROW.premium, view: FRONT_LEFT },
  { number: 2, capacity: 4, category: "PREMIUM", ...tall, x: B, y: ROW.premium, view: FRONT },
  { number: 3, capacity: 4, category: "PREMIUM", ...tall, x: C, y: ROW.premium, view: FRONT },
  { number: 4, capacity: 4, category: "PREMIUM", ...tall, x: D, y: ROW.premium, view: FRONT },
  { number: 5, capacity: 4, maxCapacity: 5, category: "PREMIUM", ...tall, x: E, y: ROW.premium, view: FRONT_RIGHT },
  { number: 6, capacity: 4, category: "PREFERRED", ...wide, x: 150, y: RIGHT[0], view: TOWN },
  { number: 7, capacity: 2, category: "STANDARD", ...sideways, x: B, y: ROW.twoBehind },
  { number: 70, capacity: 2, category: "BEST_FOR_TWO", ...sideways, x: B, y: ROW.two, view: SECOND },
  { number: 8, capacity: 2, category: "STANDARD", ...sideways, x: C, y: ROW.twoBehind },
  { number: 80, capacity: 2, category: "BEST_FOR_TWO", ...sideways, x: C, y: ROW.two, view: SECOND },
  { number: 9, capacity: 2, category: "STANDARD", ...sideways, x: D, y: ROW.twoBehind },
  { number: 90, capacity: 2, category: "BEST_FOR_TWO", ...sideways, x: D, y: ROW.two, view: SECOND },
  { number: 11, capacity: 4, category: "PREFERRED", ...wide, x: E, y: RIGHT[0], view: BAY },
  { number: 12, capacity: 4, category: "PREFERRED", ...tall, x: A, y: ROW.wall, view: TOWN },
  { number: 13, capacity: 4, category: "STANDARD", ...tall, x: B, y: ROW.wall },
  { number: 14, capacity: 4, category: "STANDARD", ...tall, x: C, y: ROW.wall },
  { number: 15, capacity: 6, category: "STANDARD", shape: "ROUND", width: 140, height: 140, x: D, y: ROW.wall },
  { number: 16, capacity: 4, category: "PREFERRED", ...wide, x: E, y: RIGHT[1], view: BAY },
  { number: 17, capacity: 4, maxCapacity: 5, category: "STANDARD", ...wide, x: E, y: RIGHT[2] },
  { number: 18, capacity: 4, maxCapacity: 5, category: "STANDARD", ...wide, x: E, y: RIGHT[3] },
  { number: 19, capacity: 2, category: "STANDARD", ...square, x: E, y: RIGHT[4] },
  { number: 20, capacity: 2, category: "STANDARD", ...square, x: E, y: RIGHT[5] },
  { number: 21, capacity: 2, category: "STANDARD", ...square, x: E, y: RIGHT[6] },
  { number: 22, capacity: 2, category: "STANDARD", ...square, x: E, y: RIGHT[7] },
  { number: 23, capacity: 5, category: "STANDARD", ...wide, x: E, y: RIGHT[8] },
  { number: 24, capacity: 5, category: "STANDARD", ...wide, x: 867, y: RIGHT[8] },
  { number: 25, capacity: 2, category: "STANDARD", ...square, x: G, y: RIGHT[7] },
  { number: 26, capacity: 2, category: "STANDARD", ...square, x: G, y: RIGHT[6] },
  { number: 27, capacity: 2, category: "STANDARD", ...square, x: G, y: RIGHT[5] },
  { number: 28, capacity: 2, category: "STANDARD", ...square, x: G, y: RIGHT[4] },
  {
    number: 29, capacity: 3, category: "STANDARD", ...square, x: F, y: RIGHT[7],
    autoAssignable: false,
    billBySeats: false,
    notes: "Mostly used for drinks. Guests may choose it online; never auto-assigned. Two guests pay for two.",
  },
  { number: 30, capacity: 2, category: "STANDARD", ...square, x: F, y: RIGHT[6] },
  { number: 31, capacity: 2, category: "STANDARD", ...square, x: F, y: RIGHT[5] },
  { number: 32, capacity: 2, category: "STANDARD", ...square, x: F, y: RIGHT[4] },
  { number: 33, capacity: 2, category: "STANDARD", ...square, x: G, y: RIGHT[3] },
  {
    number: SPARE_TABLE_NUMBER, capacity: 2, category: "STANDARD", ...square, x: G, y: RIGHT[2],
    status: "INACTIVE", onlineBookable: false, autoAssignable: false, isSpare: true,
    notes: "Spare table kept in storage. Activate to join it to table 17.",
  },
];

export interface InitialCombination {
  key: string;
  tables: number[];
  capacity: number;
  minParty: number;
  active?: boolean;
  onlineBookable?: boolean;
}

export const COMBINATIONS: readonly InitialCombination[] = [
  { key: "1+6", tables: [1, 6], capacity: 8, minParty: 6 },
  { key: "1+6+12", tables: [1, 6, 12], capacity: 12, minParty: 9 },
  { key: "2+70", tables: [2, 70], capacity: 6, minParty: 5 },
  { key: "2+70+7", tables: [2, 70, 7], capacity: 8, minParty: 7 },
  { key: "3+80", tables: [3, 80], capacity: 6, minParty: 5 },
  { key: "3+80+8", tables: [3, 80, 8], capacity: 8, minParty: 7 },
  { key: "4+90", tables: [4, 90], capacity: 6, minParty: 5 },
  { key: "4+90+9", tables: [4, 90, 9], capacity: 8, minParty: 7 },
  { key: "5+11", tables: [5, 11], capacity: 8, minParty: 6 },
  { key: "5+11+16", tables: [5, 11, 16], capacity: 12, minParty: 9 },
  { key: "23+24", tables: [23, 24], capacity: 7, minParty: 6 },
  { key: "18+33", tables: [18, 33], capacity: 7, minParty: 6 },
  {
    key: "17+spare", tables: [17, SPARE_TABLE_NUMBER], capacity: 7, minParty: 6,
    active: false, onlineBookable: false,
  },
];

/** Pairs of physically neighbouring combinations that may seat one party of up to 16 together. */
export const PAIRINGS: ReadonlyArray<[string, string]> = [
  ["1+6", "2+70+7"],
  ["2+70+7", "3+80+8"],
  ["3+80+8", "4+90+9"],
  ["4+90+9", "5+11"],
];
