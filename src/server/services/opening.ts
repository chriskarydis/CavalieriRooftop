import { loadSettings, type Db } from "./context";

export interface OpeningSummary {
  /** Season start and end as dates in an arbitrary year, for formatting as "1 May". */
  seasonStart: Date;
  seasonEnd: Date;
  /** ISO weekdays (1 = Monday) the restaurant is closed. */
  closedWeekdays: number[];
  graceMinutes: number;
  refundCutoffHours: number;
  depositPerPersonCents: number;
  maxOnlineParty: number;
}

const REFERENCE_YEAR = 2024;

/** The opening and policy facts the public pages state, read from the live settings. */
export async function getOpeningSummary(db: Db): Promise<OpeningSummary> {
  const settings = await loadSettings(db);
  const toDate = (monthDay: string): Date => {
    const [month, day] = monthDay.split("-").map(Number);
    return new Date(Date.UTC(REFERENCE_YEAR, month - 1, day, 12));
  };
  return {
    seasonStart: toDate(settings.seasonStart),
    seasonEnd: toDate(settings.seasonEnd),
    closedWeekdays: settings.closedWeekdays,
    graceMinutes: settings.graceMinutes,
    refundCutoffHours: settings.refundCutoffHours,
    depositPerPersonCents: settings.depositPerPersonCents,
    maxOnlineParty: settings.maxOnlineParty,
  };
}
