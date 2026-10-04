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
    { type: "polyline", points: [[18, 698], [690, 698]], style: "wall" },
    { type: "polyline", points: [[218, 705], [218, 1790]], style: "wall" },
    { type: "polyline", points: [[685, 700], [685, 1545]], style: "wall" },
    { type: "polyline", points: [[230, 813], [690, 813]], style: "wall" },
    { type: "polyline", points: [[540, 813], [540, 1548]], style: "wall" },
    { type: "polyline", points: [[402, 1545], [690, 1545]], style: "wall" },
    { type: "polyline", points: [[402, 1545], [402, 1777]], style: "wall" },
    { type: "polyline", points: [[218, 1777], [425, 1777]], style: "wall" },
    { type: "label", x: 148, y: 810, key: "toilets" },
    { type: "label", x: 445, y: 753, key: "entrance" },
    { type: "label", x: 330, y: 1206, key: "kitchen" },
    { type: "label", x: 612, y: 1157, key: "bar" },
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
  /** Defaults: active, online bookable, auto-assignable, not spare. */
  status?: "ACTIVE" | "INACTIVE";
  onlineBookable?: boolean;
  autoAssignable?: boolean;
  isSpare?: boolean;
  notes?: string;
}

const tall = { shape: "RECT", width: 76, height: 148 } as const;
const wide = { shape: "RECT", width: 163, height: 93 } as const;
const square = { shape: "RECT", width: 95, height: 95 } as const;

export const SPARE_TABLE_NUMBER = 99;

export const TABLES: readonly InitialTable[] = [
  { number: 1, capacity: 4, maxCapacity: 5, category: "PREMIUM", ...tall, x: 110, y: 165 },
  { number: 2, capacity: 4, category: "PREMIUM", ...tall, x: 364, y: 165 },
  { number: 3, capacity: 4, category: "PREMIUM", ...tall, x: 618, y: 165 },
  { number: 4, capacity: 4, category: "PREMIUM", ...tall, x: 872, y: 165 },
  { number: 5, capacity: 4, maxCapacity: 5, category: "PREMIUM", ...tall, x: 1076, y: 165 },
  { number: 6, capacity: 4, category: "PREFERRED", ...wide, x: 148, y: 370 },
  { number: 7, capacity: 2, category: "STANDARD", ...square, x: 364, y: 464 },
  { number: 70, capacity: 2, category: "BEST_FOR_TWO", ...square, x: 364, y: 328 },
  { number: 8, capacity: 2, category: "STANDARD", ...square, x: 579, y: 469 },
  { number: 80, capacity: 2, category: "BEST_FOR_TWO", ...square, x: 579, y: 328 },
  { number: 9, capacity: 2, category: "STANDARD", ...square, x: 794, y: 464 },
  { number: 90, capacity: 2, category: "BEST_FOR_TWO", ...square, x: 794, y: 328 },
  { number: 11, capacity: 4, category: "PREFERRED", ...wide, x: 1076, y: 370 },
  { number: 12, capacity: 4, category: "PREFERRED", ...tall, height: 138, x: 110, y: 615 },
  { number: 13, capacity: 4, category: "STANDARD", ...tall, height: 138, x: 280, y: 615 },
  { number: 14, capacity: 4, category: "STANDARD", ...tall, height: 138, x: 460, y: 615 },
  { number: 15, capacity: 6, category: "STANDARD", shape: "ROUND", width: 148, height: 148, x: 766, y: 616 },
  { number: 16, capacity: 4, category: "PREFERRED", ...wide, x: 1076, y: 526 },
  { number: 17, capacity: 4, maxCapacity: 5, category: "STANDARD", ...wide, x: 1076, y: 681 },
  { number: 18, capacity: 4, maxCapacity: 5, category: "STANDARD", ...wide, x: 1076, y: 837 },
  { number: 19, capacity: 2, category: "STANDARD", ...square, x: 1118, y: 978 },
  { number: 20, capacity: 2, category: "STANDARD", ...square, x: 1118, y: 1238 },
  { number: 21, capacity: 2, category: "STANDARD", ...square, x: 1118, y: 1462 },
  { number: 22, capacity: 2, category: "STANDARD", ...square, x: 1118, y: 1685 },
  { number: 23, capacity: 5, category: "STANDARD", ...wide, x: 1076, y: 1862 },
  { number: 24, capacity: 5, category: "STANDARD", ...wide, x: 872, y: 1862 },
  { number: 25, capacity: 2, category: "STANDARD", ...square, x: 956, y: 1686 },
  { number: 26, capacity: 2, category: "STANDARD", ...square, x: 956, y: 1462 },
  { number: 27, capacity: 2, category: "STANDARD", ...square, x: 956, y: 1248 },
  { number: 28, capacity: 2, category: "STANDARD", ...square, x: 956, y: 978 },
  {
    number: 29, capacity: 3, category: "STANDARD", ...square, x: 794, y: 1686,
    autoAssignable: false,
    notes: "Mostly used for drinks. Guests may choose it online; never auto-assigned.",
  },
  { number: 30, capacity: 2, category: "STANDARD", ...square, x: 794, y: 1462 },
  { number: 31, capacity: 2, category: "STANDARD", ...square, x: 794, y: 1240 },
  { number: 32, capacity: 2, category: "STANDARD", ...square, x: 794, y: 978 },
  { number: 33, capacity: 2, category: "STANDARD", ...square, x: 872, y: 809 },
  {
    number: SPARE_TABLE_NUMBER, capacity: 2, category: "STANDARD", ...square, x: 920, y: 681,
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
