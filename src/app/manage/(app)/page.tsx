import { getFormatter, getTranslations } from "next-intl/server";
import type { LiveTableState } from "@/domain/table-state";
import { zonedTime } from "@/domain/time";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getFloorPlanView } from "@/server/floor/queries";
import { loadFloorConfig, loadSettings } from "@/server/services/context";
import { getLiveFloor, getRecentNoShows, type LiveBooking } from "@/server/services/live-floor";
import { FloorPlan, type FloorPlanTable } from "@/ui/floor-plan/FloorPlan";
import { cancelAction, completeAction, completeWalkInAction, noShowAction, seatAction } from "../actions";
import { AutoRefresh } from "./AutoRefresh";
import { WalkInForm, type SeatingOption } from "./WalkInForm";

const STATE_COLOR: Record<LiveTableState, string> = {
  AVAILABLE: "#3f9b6b",
  RESERVED: "#4a78b5",
  ARRIVING: "#7a5cc0",
  LATE: "#d9822b",
  OCCUPIED: "#b23a48",
  HELD: "#e0a030",
  BLOCKED: "#5b6870",
  OUT_OF_SERVICE: "#9aa5ab",
  INACTIVE: "#c5ccd0",
};

const buttonClass = "rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-100";

interface Row extends LiveBooking {
  tables: number[];
}

/** One row per reservation or walk-in, with all of its tables. */
function groupBookings(live: Awaited<ReturnType<typeof getLiveFloor>>): Row[] {
  const rows = new Map<string, Row>();
  for (const table of live) {
    for (const booking of table.bookings) {
      if (booking.kind === "HOLD") continue;
      const key = booking.reservationId ?? booking.walkInId ?? `${table.tableId}-${booking.startsAt.toISOString()}`;
      const existing = rows.get(key);
      if (existing) existing.tables.push(table.number);
      else rows.set(key, { ...booking, tables: [table.number] });
    }
  }
  return [...rows.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.tables[0] - b.tables[0]);
}

export default async function LiveFloorPage({ searchParams }: PageProps<"/manage">) {
  await requirePermission("operations");
  const t = await getTranslations("manage");
  const tPlan = await getTranslations("floorPlan");
  const format = await getFormatter();
  const { error } = await searchParams;

  const [plan, live, noShows, config, settings] = await Promise.all([
    getFloorPlanView(),
    getLiveFloor(db),
    getRecentNoShows(db),
    loadFloorConfig(db),
    loadSettings(db),
  ]);
  if (!plan) return <p>{t("noFloorPlan")}</p>;

  const stateOf = new Map(live.map((table) => [table.tableId, table.state]));
  const tables: FloorPlanTable[] = plan.tables.map((table) => {
    const state = stateOf.get(table.id) ?? "AVAILABLE";
    return {
      ...table,
      color: STATE_COLOR[state],
      muted: false,
      label: t("tableAria", { number: table.number, capacity: table.capacity, state: t(`state.${state}`) }),
    };
  });

  const rows = groupBookings(live);
  const euro = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const time = (instant: Date) => zonedTime(instant, settings.timezone);

  const numberOf = new Map(config.tables.map((table) => [table.id, table.number]));
  const seatings: SeatingOption[] = [
    ...config.tables
      .filter((table) => table.status === "ACTIVE")
      .sort((a, b) => a.number - b.number)
      .map((table) => ({ value: table.id, label: `${table.number} (${table.maxCapacity})` })),
    ...config.combinations
      .filter((combination) => combination.active)
      .map((combination) => ({
        value: combination.tableIds.join(","),
        label: `${combination.tableIds.map((id) => numberOf.get(id)).join(" + ")} (${combination.capacity})`,
      })),
  ];

  return (
    <main className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <AutoRefresh />
      <section aria-labelledby="floor-heading">
        <h1 id="floor-heading" className="mb-2 text-lg font-semibold">
          {t("liveFloor")}
        </h1>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <FloorPlan
            plan={plan}
            tables={tables}
            title={t("liveFloor")}
            areaLabels={{
              toilets: tPlan("areas.toilets"),
              entrance: tPlan("areas.entrance"),
              kitchen: tPlan("areas.kitchen"),
              bar: tPlan("areas.bar"),
            }}
          />
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {(Object.keys(STATE_COLOR) as LiveTableState[]).map((state) => (
            <li key={state} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3 rounded-sm" style={{ background: STATE_COLOR[state] }} />
              {t(`state.${state}`)}
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-6">
        {typeof error === "string" && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
            {t.has(`errors.${error}`) ? t(`errors.${error}`, { time: "" }) : t("errors.GENERIC")}
          </p>
        )}

        <section aria-labelledby="tonight-heading">
          <h2 id="tonight-heading" className="mb-2 text-lg font-semibold">
            {t("tonight")}
          </h2>
          {rows.length === 0 ? (
            <p className="text-slate-600">{t("nothingBooked")}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">{t("columns.time")}</th>
                    <th className="px-3 py-2 font-medium">{t("columns.table")}</th>
                    <th className="px-3 py-2 font-medium">{t("columns.guest")}</th>
                    <th className="px-3 py-2 font-medium">{t("columns.party")}</th>
                    <th className="px-3 py-2 font-medium">{t("columns.status")}</th>
                    <th className="px-3 py-2 font-medium">{t("columns.paid")}</th>
                    <th className="px-3 py-2 font-medium">{t("columns.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const status = row.reservationStatus ?? row.kind;
                    return (
                      <tr key={row.reservationId ?? row.walkInId ?? `${row.tables[0]}-${row.startsAt.toISOString()}`} className="border-b border-slate-100 align-top last:border-0">
                        <td className="px-3 py-2 tabular-nums">
                          {time(row.startsAt)}–{time(row.endsAt)}
                        </td>
                        <td className="px-3 py-2">{row.tables.sort((a, b) => a - b).join(" + ")}</td>
                        <td className="px-3 py-2">
                          {row.guestName ?? (row.kind === "WALK_IN" ? t("walkIn") : "—")}
                          {row.reference && <span className="block text-xs text-slate-500">{row.reference}</span>}
                          {row.notes && <span className="block text-xs text-slate-500">{row.notes}</span>}
                        </td>
                        <td className="px-3 py-2">{row.partySize ?? "—"}</td>
                        <td className="px-3 py-2">{t.has(`booking.${status}`) ? t(`booking.${status}`) : status}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.depositCents === null ? "—" : `${euro(row.depositCents)} / ${euro(row.tableFeeCents ?? 0)}`}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1.5">
                            {row.reservationId && (status === "CONFIRMED" || status === "LATE") && (
                              <form action={seatAction.bind(null, row.reservationId)}>
                                <button className={buttonClass}>{t("actions.seat")}</button>
                              </form>
                            )}
                            {row.reservationId && status === "LATE" && (
                              <form action={noShowAction.bind(null, row.reservationId)}>
                                <button className={buttonClass}>{t("actions.noShow")}</button>
                              </form>
                            )}
                            {row.reservationId && status === "SEATED" && (
                              <form action={completeAction.bind(null, row.reservationId)}>
                                <button className={buttonClass}>{t("actions.complete")}</button>
                              </form>
                            )}
                            {row.walkInId && (
                              <form action={completeWalkInAction.bind(null, row.walkInId)}>
                                <button className={buttonClass}>{t("actions.complete")}</button>
                              </form>
                            )}
                            {row.reservationId && (status === "CONFIRMED" || status === "LATE") && (
                              <details>
                                <summary className={`${buttonClass} cursor-pointer list-none text-red-800`}>
                                  {t("actions.cancel")}
                                </summary>
                                <form action={cancelAction.bind(null, row.reservationId)} className="mt-1">
                                  <button className="rounded-md bg-red-700 px-2 py-1 text-white">
                                    {t("actions.confirmCancel")}
                                  </button>
                                </form>
                              </details>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {noShows.length > 0 && (
          <section aria-labelledby="no-show-heading">
            <h2 id="no-show-heading" className="mb-2 text-lg font-semibold">
              {t("noShows")}
            </h2>
            <ul className="space-y-2 text-sm">
              {noShows.map((noShow) => (
                <li key={noShow.reservationId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <span>
                    {time(noShow.startsAt)} · {noShow.tableNumbers.join(" + ")} · {noShow.guestName ?? "—"} ·{" "}
                    {noShow.partySize} · {noShow.reference}
                  </span>
                  <form action={seatAction.bind(null, noShow.reservationId)}>
                    <button className={buttonClass}>{t("seatAnyway")}</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="walk-in-heading">
          <h2 id="walk-in-heading" className="mb-2 text-lg font-semibold">
            {t("newWalkIn")}
          </h2>
          <WalkInForm seatings={seatings} />
        </section>
      </div>
    </main>
  );
}
