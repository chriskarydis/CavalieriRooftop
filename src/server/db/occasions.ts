/** What a party may be celebrating; asked at booking so the restaurant can prepare. */
export const OCCASIONS = ["BIRTHDAY", "ANNIVERSARY", "PROPOSAL", "OTHER"] as const;
export type Occasion = (typeof OCCASIONS)[number];
