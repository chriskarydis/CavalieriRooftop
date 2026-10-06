import { DateField } from "./DateField";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { LiveTableState } from "@/domain/table-state";
import { zonedTime } from "@/domain/time";
import { formatDate } from "@/i18n/intl-locale";
import { localized } from "@/i18n/localized";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getFloorPlanView } from "@/server/floor/queries";
import { BookingError, loadFloorConfig, loadSettings, type FloorConfig } from "@/server/services/context";
import { getLiveFloor, getRecentNoShows, type LiveBooking, type LiveTable } from "@/server/services/live-floor";
import { listUnreadNotifications } from "@/server/services/notifications";
import { previewMove, type MovePreview } from "@/server/services/table-ops";
import type { FloorPlanTable } from "@/ui/floor-plan/FloorPlan";
import type { FloorPlanView } from "@/ui/floor-plan/types";
import {
  blockAction,
  completeWalkInAction,
  extendWalkInAction,
  markNotificationsReadAction,
  moveAction,
  unblockAction,
} from "../actions";
import { AutoRefresh } from "./AutoRefresh";
import { LiveFloorPlan } from "./LiveFloorPlan";
import { NewReservationChime } from "./NewReservationChime";
import { ReservationActions } from "./ReservationActions";
import { cardClass, inputClass, primaryButton, secondaryButton } from "./ui";
import { WalkInForm, type SeatingOption } from "./WalkInForm";

const STATE_COLOR: Record<LiveTableState, string> = {
  AVAILABLE: "#3f9b6b",
  RESERVED: "#4a78b5",
  ARRIVING: "#7a5cc0",
  LATE: "#d9822b",
  OCCUPIED: "#b23a48",
  HELD: "#c0269b",
  BLOCKED: "#5b6870",
  OUT_OF_SERVICE: "#9aa5ab",
  INACTIVE: "#c5ccd0",
};

const BLOCK_DURATIONS = [60, 120, 180, 360, 720] as const;
const HOUR_MINUTES = 60;

interface Row extends LiveBooking {
  tables: number[];
}

/** One row per reservation or walk-in, with all of its tables. */
function groupBookings(live: LiveTable[]): Row[] {
  const rows = new Map<string, Row>();
  for (const table of live) {
    for (const booking of table.bookings) {
      const key = booking.reservationId ?? booking.walkInId ?? booking.allocationId;
      const existing = rows.get(key);
      if (existing) existing.tables.push(table.number);
      else rows.set(key, { ...booking, tables: [table.number] });
    }
  }
  return [...rows.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.tables[0] - b.tables[0]);
}

function seatingOptions(config: FloorConfig): SeatingOption[] {
  const numberOf = new Map(config.tables.map((table) => [table.id, table.number]));
  return [
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
}

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export default async function LiveFloorPage({ searchParams }: PageProps<"/manage">) {
  await requirePermission("operations");
  const t = await getTranslations("manage");
  const tPlan = await getTranslations("floorPlan");
  const format = await getFormatter();
  const query = await searchParams;
  const error = first(query.error);
  const selectedTableId = first(query.table) ?? null;
  const moveId = first(query.move);
  const moveTo = first(query.to);

  const [plan, live, noShows, config, settings, notifications] = await Promise.all([
    getFloorPlanView(),
    getLiveFloor(db),
    getRecentNoShows(db),
    loadFloorConfig(db),
    loadSettings(db),
    listUnreadNotifications(db),
  ]);
  if (!plan) return <p>{t("noFloorPlan")}</p>;

  const liveById = new Map(live.map((table) => [table.tableId, table]));
  const tables: FloorPlanTable[] = plan.tables.map((table) => {
    const state = liveById.get(table.id)?.state ?? "AVAILABLE";
    return {
      ...table,
      color: STATE_COLOR[state],
      muted: false,
      selectable: true,
      label: t("tableAria", { number: table.number, capacity: table.capacity, state: t(`state.${state}`) }),
    };
  });

  // Dragging a table moves the reservation that is on it now, or the next one due.
  const movable: Record<string, string> = {};
  for (const table of live) {
    const booking = table.bookings.find(
      (entry) =>
        entry.kind === "RESERVATION" && entry.reservationId !== null && ["CONFIRMED", "LATE", "SEATED"].includes(entry.reservationStatus ?? ""),
    );
    if (booking?.reservationId) movable[table.tableId] = booking.reservationId;
  }

  const rows = groupBookings(live);
  const euro = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const time = (instant: Date) => zonedTime(instant, settings.timezone);
  const seatings = seatingOptions(config);

  let movePreview: MovePreview | null = null;
  let moveError: string | null = null;
  if (moveId && moveTo) {
    try {
      movePreview = await previewMove(db, moveId, moveTo.split(","));
    } catch (caught) {
      if (!(caught instanceof BookingError)) throw caught;
      moveError = caught.code;
    }
  }
  const moving = moveId ? rows.find((row) => row.reservationId === moveId) : undefined;

  return (
    <main className="grid gap-6 lg:grid-cols-[minmax(0,34rem)_1fr] 2xl:grid-cols-[minmax(0,44rem)_1fr]">
      <AutoRefresh />
      <section aria-labelledby="floor-heading" className="lg:sticky lg:top-4 lg:self-start">
        <h1 id="floor-heading" className="mb-2 text-lg font-semibold">
          {t("liveFloor")}
        </h1>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <p>{t("dragHint")}</p>
          <NewReservationChime
            latestId={notifications.find((notification) => notification.type === "CONFIRMED")?.id ?? ""}
            labels={{ on: t("chime.on"), off: t("chime.off"), test: t("chime.hint") }}
          />
        </div>
        <div className="rounded-lg border border-line bg-white shadow-sm p-3">
          <LiveFloorPlan
            plan={plan}
            tables={tables}
            title={t("liveFloor")}
            selectedId={selectedTableId}
            movable={movable}
            areaLabels={{
              toilets: tPlan("areas.toilets"),
              entrance: tPlan("areas.entrance"),
              kitchen: tPlan("areas.kitchen"),
              bar: tPlan("areas.bar"),
              viewTop: tPlan("areas.viewTop"),
              viewBottom: tPlan("areas.viewBottom"),
              viewLeft: tPlan("areas.viewLeft"),
              viewRight: tPlan("areas.viewRight"),
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

      <div className="min-w-0 space-y-6">
        {(error || moveError) && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
            {t.has(`errors.${error ?? moveError}`) ? t(`errors.${error ?? moveError}`, { time: "" }) : t("errors.GENERIC")}
          </p>
        )}

        {notifications.length > 0 && (
          <section aria-labelledby="notifications-heading" className={cardClass}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 id="notifications-heading" className="text-lg font-semibold">
                {t("notifications.title", { count: notifications.length })}
              </h2>
              <form action={markNotificationsReadAction}>
                <button className={secondaryButton}>{t("notifications.markRead")}</button>
              </form>
            </div>
            <ul className="space-y-1 text-sm">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <strong>{t.has(`notifications.type.${notification.type}`) ? t(`notifications.type.${notification.type}`) : notification.type}</strong>
                  {" · "}
                  {notification.guestName} · {notification.partySize} ·{" "}
                  {formatDate(notification.startsAt, settings.timezone)}{" "}
                  {time(notification.startsAt)} · {notification.tableNumbers.join(" + ") || "—"} · {notification.reference}
                </li>
              ))}
            </ul>
          </section>
        )}

        {moveId && (
          <section aria-labelledby="move-heading" className={`${cardClass} border-slate-900`}>
            <h2 id="move-heading" className="mb-2 text-lg font-semibold">
              {t("move.title", { guest: moving?.guestName ?? moving?.reference ?? "" })}
            </h2>
            <form method="get" className="flex flex-wrap items-end gap-3 text-sm font-medium">
              <input type="hidden" name="move" value={moveId} />
              <label>
                {t("move.to")}
                <select name="to" defaultValue={moveTo} required className={inputClass}>
                  {seatings.map((seating) => (
                    <option key={seating.value} value={seating.value}>
                      {seating.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={secondaryButton}>
                {t("move.check")}
              </button>
              <Link href="/manage" className={secondaryButton}>
                {t("move.close")}
              </Link>
            </form>
            {movePreview && moveTo && (
              <div className="mt-4 space-y-3 text-sm">
                <p>
                  {t("move.summary", {
                    from: movePreview.fromTableNumbers.join(" + "),
                    to: movePreview.toTableNumbers.join(" + "),
                  })}
                </p>
                {movePreview.differenceCents === 0 ? (
                  <p>{t("move.samePrice")}</p>
                ) : (
                  <p className="rounded-md bg-amber-50 p-2 text-amber-900">
                    {t("move.priceChange", {
                      paidFee: euro(movePreview.paid.tableFeeCents),
                      newFee: euro(movePreview.target.tableFeeCents),
                      paidDeposit: euro(movePreview.paid.depositCents),
                      newDeposit: euro(movePreview.target.depositCents),
                    })}
                  </p>
                )}
                <form action={moveAction.bind(null, moveId, moveTo, "/manage")}>
                  <button type="submit" className={primaryButton}>
                    {t("move.confirm")}
                  </button>
                </form>
              </div>
            )}
          </section>
        )}

        {selectedTableId && liveById.has(selectedTableId) && (
          <TableDetails
            table={liveById.get(selectedTableId)!}
            view={plan.tables.find((table) => table.id === selectedTableId)}
            categories={plan.categories}
            time={time}
          />
        )}

        <section aria-labelledby="tonight-heading">
          <h2 id="tonight-heading" className="mb-2 text-lg font-semibold">
            {t("tonight")}
          </h2>
          {rows.length === 0 ? (
            <p className="text-slate-600">{t("nothingBooked")}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-white shadow-sm">
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
                    const status = row.kind === "HOLD" ? "HOLD" : (row.reservationStatus ?? row.kind);
                    return (
                      <tr
                        key={row.reservationId ?? row.walkInId ?? row.allocationId}
                        className={`border-b border-slate-100 align-top last:border-0 ${row.kind === "HOLD" ? "bg-fuchsia-50" : ""}`}
                      >
                        <td className="px-3 py-2 tabular-nums">
                          {time(row.startsAt)}–{time(row.endsAt)}
                        </td>
                        <td className="px-3 py-2">{row.tables.sort((a, b) => a - b).join(" + ")}</td>
                        <td className="px-3 py-2">
                          {row.guestName ?? (row.kind === "WALK_IN" ? t("walkIn") : row.kind === "HOLD" ? t("details.holdNoDetails") : "—")}
                          {row.reference && <span className="block text-xs text-slate-500">{row.reference}</span>}
                          {row.notes && <span className="block text-xs text-slate-500">{row.notes}</span>}
                        </td>
                        <td className="px-3 py-2">{row.partySize ?? "—"}</td>
                        <td className="px-3 py-2">{t.has(`booking.${status}`) ? t(`booking.${status}`) : status}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.depositCents === null ? "—" : `${euro(row.depositCents)} / ${euro(row.tableFeeCents ?? 0)}`}
                        </td>
                        <td className="px-3 py-2">
                          {row.kind === "HOLD" && row.holdExpiresAt && (
                            <span className="text-xs text-slate-600">{t("details.holdUntil", { time: time(row.holdExpiresAt) })}</span>
                          )}
                          {row.kind !== "HOLD" && row.reservationId && row.reservationStatus && (
                            <ReservationActions reservationId={row.reservationId} status={row.reservationStatus} returnTo="/manage" />
                          )}
                          {row.walkInId && (
                            <div className="flex flex-wrap gap-1.5">
                              <form action={completeWalkInAction.bind(null, row.walkInId, "/manage")}>
                                <button className={secondaryButton}>{t("actions.complete")}</button>
                              </form>
                              <form action={extendWalkInAction.bind(null, row.walkInId, "/manage")}>
                                <button className={secondaryButton}>{t("actions.extend")}</button>
                              </form>
                            </div>
                          )}
                          {row.kind === "BLOCK" && (
                            <form action={unblockAction.bind(null, row.allocationId, "/manage")}>
                              <button className={secondaryButton}>{t("actions.unblock")}</button>
                            </form>
                          )}
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
                <li key={noShow.reservationId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white shadow-sm px-3 py-2">
                  <span>
                    {time(noShow.startsAt)} · {noShow.tableNumbers.join(" + ")} · {noShow.guestName ?? "—"} ·{" "}
                    {noShow.partySize} · {noShow.reference}
                  </span>
                  <ReservationActions reservationId={noShow.reservationId} status="NO_SHOW" returnTo="/manage" />
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

async function TableDetails({
  table,
  view,
  categories,
  time,
}: {
  table: LiveTable;
  view: FloorPlanView["tables"][number] | undefined;
  categories: FloorPlanView["categories"];
  time: (instant: Date) => string;
}) {
  const t = await getTranslations("manage");
  const locale = await getLocale();
  const category = categories.find((entry) => entry.id === view?.categoryId);
  const returnTo = `/manage?table=${table.tableId}`;
  const bookings = table.bookings;
  const usable = table.state !== "OUT_OF_SERVICE" && table.state !== "INACTIVE";

  return (
    <section aria-labelledby="table-heading" className={cardClass}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="table-heading" className="text-lg font-semibold">
          {t("details.title", { number: table.number })}
        </h2>
        <span className="text-sm">
          <Link href="/manage/tables" className="underline">
            {t("details.settings")}
          </Link>
          {" · "}
          <Link href="/manage" className="underline">
            {t("move.close")}
          </Link>
        </span>
      </div>
      <p className="text-sm text-slate-700">
        {t("details.meta", { capacity: view?.capacity ?? 0, max: view?.maxCapacity ?? 0 })}
        {category && ` · ${localized(category.name, locale)}`} · <strong>{t(`state.${table.state}`)}</strong>
      </p>

      <ul className="mt-3 space-y-2 text-sm">
        {bookings.length === 0 && <li className="text-slate-600">{t("details.noBookings")}</li>}
        {bookings.map((booking) => (
          <li
            key={booking.allocationId}
            className={`rounded-md border p-2 ${booking.kind === "HOLD" ? "border-fuchsia-300 bg-fuchsia-50" : "border-slate-200"}`}
          >
            {booking.kind === "HOLD" && (
              <p className="mb-1 text-xs font-semibold tracking-wide text-fuchsia-900 uppercase">
                {t("details.holdTitle")}
                {booking.holdExpiresAt && ` · ${t("details.holdUntil", { time: time(booking.holdExpiresAt) })}`}
              </p>
            )}
            <p>
              <span className="tabular-nums">
                {time(booking.startsAt)}–{time(booking.endsAt)}
              </span>{" "}
              · {booking.guestName ?? (booking.kind === "WALK_IN" ? t("walkIn") : booking.kind === "HOLD" ? t("details.holdNoDetails") : t(`booking.${booking.kind}`))}
              {booking.partySize !== null && ` · ${booking.partySize}`}
              {booking.reference && ` · ${booking.reference}`}
              {booking.kind !== "HOLD" && booking.reservationStatus && ` · ${t(`booking.${booking.reservationStatus}`)}`}
            </p>
            {booking.kind === "HOLD" && (booking.guestPhone || booking.guestEmail) && (
              <p className="text-xs text-slate-700">{[booking.guestPhone, booking.guestEmail].filter(Boolean).join(" · ")}</p>
            )}
            {booking.notes && <p className="text-xs text-slate-500">{booking.notes}</p>}
            <div className="mt-1.5">
              {booking.kind !== "HOLD" && booking.reservationId && booking.reservationStatus && (
                <ReservationActions reservationId={booking.reservationId} status={booking.reservationStatus} returnTo={returnTo} />
              )}
              {booking.walkInId && (
                <form action={completeWalkInAction.bind(null, booking.walkInId, returnTo)}>
                  <button className={secondaryButton}>{t("actions.complete")}</button>
                </form>
              )}
              {booking.kind === "BLOCK" && (
                <form action={unblockAction.bind(null, booking.allocationId, returnTo)}>
                  <button className={secondaryButton}>{t("actions.unblock")}</button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>

      {usable && (
        <form action={blockAction.bind(null, table.tableId, returnTo)} className="mt-4 flex flex-wrap items-end gap-3 text-sm font-medium">
          <label>
            {t("details.blockDate")}
            <DateField name="date" className={inputClass} />
          </label>
          <label>
            {t("details.blockStart")}
            <input name="start" type="time" className={inputClass} />
          </label>
          <label>
            {t("details.blockFor")}
            <select name="minutes" defaultValue={BLOCK_DURATIONS[1]} className={inputClass}>
              {BLOCK_DURATIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t("details.hours", { hours: minutes / HOUR_MINUTES })}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-40 flex-1">
            {t("details.reason")}
            <input name="reason" maxLength={200} className={inputClass} />
          </label>
          <button type="submit" className={secondaryButton}>
            {t("details.block")}
          </button>
          <p className="basis-full text-xs font-normal text-slate-600">{t("details.blockHint")}</p>
        </form>
      )}
    </section>
  );
}
