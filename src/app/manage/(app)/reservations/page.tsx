import { DateField } from "../DateField";
import { getFormatter, getTranslations } from "next-intl/server";
import { RESERVATION_STATUSES, type ReservationStatus } from "@/domain/reservation-state";
import { addMinutes, zonedDate, zonedTime, zonedToInstant } from "@/domain/time";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { formatCalendarDate } from "@/i18n/intl-locale";
import { loadFloorConfig, loadSettings } from "@/server/services/context";
import { listReservations } from "@/server/services/reservation-list";
import { listBlocks } from "@/server/services/table-ops";
import { hasPermission } from "@/domain/permissions";
import { changeReservationAction, moveFromListAction, refundAction, unblockAction } from "../../actions";
import { PrintButton } from "../PrintButton";
import { ChangeReservationDialog, MoveTableDialog, type SeatingChoice } from "./ReservationDialogs";
import { ReservationActions } from "../ReservationActions";
import { cardClass, inputClass, primaryButton, secondaryButton } from "../ui";

const LISTED_STATUSES = RESERVATION_STATUSES.filter((status) => status !== "PENDING_PAYMENT" && status !== "EXPIRED");
const DAY_MINUTES = 24 * 60;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export default async function ReservationsPage({ searchParams }: PageProps<"/manage/reservations">) {
  const staff = await requirePermission("operations");
  const mayRefund = hasPermission(staff.role, "refunds");
  const t = await getTranslations("manage");
  const format = await getFormatter();
  const query = await searchParams;
  const settings = await loadSettings(db);

  const requestedDate = first(query.date);
  const date = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : zonedDate(new Date(), settings.timezone);
  const requestedStatus = first(query.status);
  const status = LISTED_STATUSES.find((entry) => entry === requestedStatus) as ReservationStatus | undefined;
  const search = first(query.q) ?? "";
  const error = first(query.error);
  const justRefunded = Number(first(query.refunded) ?? 0);
  const done = first(query.done) === "1";

  const dayStart = zonedToInstant(date, "00:00", settings.timezone);
  const [reservations, blocks] = await Promise.all([
    listReservations(db, { date, status, search }),
    listBlocks(db, dayStart, addMinutes(dayStart, DAY_MINUTES)),
  ]);
  // What a reservation can be moved to: every active table, then the joined tables.
  const config = await loadFloorConfig(db);
  const numberOf = new Map(config.tables.map((table) => [table.id, table.number]));
  const idOf = new Map(config.tables.map((table) => [table.number, table.id]));
  const singleTables: SeatingChoice[] = config.tables
    .filter((table) => table.status === "ACTIVE")
    .sort((a, b) => a.number - b.number)
    .map((table) => ({ value: table.id, label: `${table.number} (${table.maxCapacity})` }));
  const seatings: SeatingChoice[] = [
    ...singleTables,
    ...config.combinations
      .filter((combination) => combination.active)
      .map((combination) => ({
        value: combination.tableIds.join(","),
        label: `${combination.tableIds.map((id) => numberOf.get(id)).join(" + ")} (${combination.capacity})`,
      })),
  ];

  const returnTo = `/manage/reservations?${new URLSearchParams({ date, ...(status ? { status } : {}), ...(search ? { q: search } : {}) })}`;
  const euro = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const covers = reservations
    .filter((reservation) => !["CANCELLED", "NO_SHOW"].includes(reservation.status))
    .reduce((sum, reservation) => sum + reservation.partySize, 0);

  // Money and guests for the evening. Cancelled and no-show reservations are counted apart.
  const lost = (reservation: (typeof reservations)[number]) => ["CANCELLED", "NO_SHOW"].includes(reservation.status);
  const kept = reservations.filter((reservation) => !lost(reservation));
  const sum = (rows: typeof reservations, pick: (row: (typeof reservations)[number]) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const money = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  const totals = [
    { label: t("totals.reservations"), value: String(kept.length) },
    { label: t("totals.guests"), value: String(covers) },
    { label: t("totals.deposits"), value: money(sum(kept, (row) => row.depositCents)) },
    { label: t("totals.tableFees"), value: money(sum(kept, (row) => row.tableFeeCents)) },
    { label: t("totals.total"), value: money(sum(kept, (row) => row.totalCents)), strong: true },
    { label: t("totals.chosen"), value: String(kept.filter((row) => row.tableFeeCents > 0).length) },
    { label: t("totals.cancelled"), value: String(reservations.filter((row) => row.status === "CANCELLED").length) },
    { label: t("totals.noShows"), value: String(reservations.filter((row) => row.status === "NO_SHOW").length) },
    { label: t("totals.refunded"), value: money(sum(reservations, (row) => row.refundedCents)) },
    { label: t("totals.keptFromLost"), value: money(sum(reservations.filter(lost), (row) => row.paidCents - row.refundedCents)) },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="mb-0 flex-1 text-lg font-semibold">
          {t("reservations.title")}
          <span className="ml-3 hidden text-base print:inline">{formatCalendarDate(date)}</span>
        </h1>
        <PrintButton label={t("reservations.print")} className={`${primaryButton} print:hidden`} />
      </div>

      <form method="get" className={`${cardClass} flex flex-wrap items-end gap-3 text-sm font-medium print:hidden`}>
        <label>
          {t("reservations.date")}
          <DateField name="date" defaultValue={date} required className={inputClass} />
        </label>
        <label>
          {t("columns.status")}
          <select name="status" defaultValue={status ?? ""} className={inputClass}>
            <option value="">{t("reservations.allStatuses")}</option>
            {LISTED_STATUSES.map((entry) => (
              <option key={entry} value={entry}>
                {t(`booking.${entry}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-48 flex-1">
          {t("reservations.search")}
          <input type="search" name="q" defaultValue={search} className={inputClass} />
        </label>
        <button type="submit" className={primaryButton}>
          {t("reservations.show")}
        </button>
      </form>

      {justRefunded > 0 && !error && (
        <p role="status" className="rounded border border-emerald-300 bg-emerald-50 p-3 font-medium text-emerald-900">
          {t("reservations.refundDone", { amount: format.number(justRefunded / 100, { style: "currency", currency: "EUR" }) })}
        </p>
      )}

      {done && !error && (
        <p role="status" className="rounded border border-emerald-300 bg-emerald-50 p-3 font-medium text-emerald-900">
          {t("reservations.done")}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          {t.has(`errors.${error}`) ? t(`errors.${error}`, { time: "" }) : t("errors.GENERIC")}
        </p>
      )}

      <p className="text-sm text-slate-600 print:hidden">{t("reservations.summary", { count: reservations.length, covers })}</p>

      <section aria-labelledby="totals-heading" className={cardClass}>
        <h2 id="totals-heading">{t("totals.title")}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5 print:grid-cols-5">
          {totals.map((entry) => (
            <div key={entry.label}>
              <dt className="text-xs text-slate-600">{entry.label}</dt>
              <dd className={`tabular-nums ${entry.strong ? "text-xl font-semibold" : "text-lg"}`}>{entry.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500">{t("totals.note")}</p>
      </section>

      {reservations.length > 0 && (
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
                <th className="px-3 py-2 font-medium print:hidden">{t("columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((reservation) => (
                <tr key={reservation.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-3 py-2 tabular-nums">{zonedTime(reservation.startsAt, settings.timezone)}</td>
                  <td className="px-3 py-2">
                    {reservation.tableNumbers.join(" + ") || "—"}
                    {reservation.selectionMode === "CHOSEN" && reservation.tableNumbers.length > 0 && (
                      <span className="block text-xs text-slate-500">{t("reservations.chosen")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {reservation.guestName ?? "—"}
                    <span className="block text-xs text-slate-500">
                      {[reservation.reference, reservation.guestPhone, reservation.guestEmail].filter(Boolean).join(" · ")}
                    </span>
                    {reservation.notes && <span className="block text-xs text-slate-500">{reservation.notes}</span>}
                  </td>
                  <td className="px-3 py-2">{reservation.partySize}</td>
                  <td className="px-3 py-2">{t(`booking.${reservation.status}`)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {euro(reservation.depositCents)} / {euro(reservation.tableFeeCents)}
                    {reservation.refundedCents > 0 && (
                      <span className="mt-1 block w-fit rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-900">
                        {t("reservations.refunded", { amount: euro(reservation.refundedCents) })}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 print:hidden">
                    <ReservationActions
                      reservationId={reservation.id}
                      status={reservation.status}
                      returnTo={returnTo}
                      moveControl={
                        <MoveTableDialog
                          action={moveFromListAction.bind(null, reservation.id, returnTo)}
                          seatings={seatings}
                          labels={{
                            button: t("change.tableButton"),
                            title: t("change.tableTitle", { guest: reservation.guestName ?? reservation.reference }),
                            now: t("change.tableNow", { table: reservation.tableNumbers.join(" + ") || "—" }),
                            to: t("change.tableTo"),
                            note: t("change.noMoney"),
                            confirm: t("change.tableConfirm"),
                            close: t("move.close"),
                          }}
                        />
                      }
                      extra={
                        <ChangeReservationDialog
                          action={changeReservationAction.bind(null, reservation.id, returnTo)}
                          current={{
                            date: zonedDate(reservation.startsAt, settings.timezone),
                            time: zonedTime(reservation.startsAt, settings.timezone),
                            guests: reservation.partySize,
                            tableId: reservation.tableNumbers.length === 1 ? (idOf.get(reservation.tableNumbers[0]) ?? "") : "",
                          }}
                          timeSlots={settings.timeSlots}
                          maxParty={settings.maxOnlineParty}
                          tables={singleTables}
                          labels={{
                            button: t("change.dateButton"),
                            title: t("change.dateTitle", { guest: reservation.guestName ?? reservation.reference }),
                            now: t("change.dateNow", {
                              date: formatCalendarDate(zonedDate(reservation.startsAt, settings.timezone)),
                              time: zonedTime(reservation.startsAt, settings.timezone),
                              guests: reservation.partySize,
                              table: reservation.tableNumbers.join(" + ") || "—",
                            }),
                            date: t("reservations.date"),
                            time: t("columns.time"),
                            guests: t("change.guests"),
                            table: t("columns.table"),
                            auto: t("change.auto"),
                            note: t("change.dateNote"),
                            confirm: t("change.dateConfirm"),
                            close: t("move.close"),
                          }}
                        />
                      }
                    />
                    {mayRefund &&
                      (reservation.status === "CANCELLED" || reservation.status === "NO_SHOW") &&
                      reservation.paidCents > reservation.refundedCents && (
                        <details className="mt-1.5">
                          <summary className={`${secondaryButton} inline-block cursor-pointer list-none`}>
                            {t("reservations.refund")}
                          </summary>
                          <form action={refundAction.bind(null, reservation.id, returnTo)} className="mt-2 space-y-2">
                            <label className="block">
                              {t("reservations.refundAmount")}
                              <input
                                name="amount"
                                type="number"
                                min={0.01}
                                step="0.01"
                                max={(reservation.paidCents - reservation.refundedCents) / 100}
                                defaultValue={(reservation.paidCents - reservation.refundedCents) / 100}
                                required
                                className={inputClass}
                              />
                            </label>
                            <label className="block">
                              {t("reservations.refundReason")}
                              <input name="reason" required minLength={3} maxLength={300} className={inputClass} />
                            </label>
                            <button className="rounded-md bg-red-700 px-2 py-1 text-sm text-white">
                              {t("reservations.refundConfirm")}
                            </button>
                          </form>
                        </details>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {blocks.length > 0 && (
        <section aria-labelledby="blocks-heading">
          <h2 id="blocks-heading" className="mb-2 font-semibold">
            {t("reservations.blocks")}
          </h2>
          <ul className="space-y-2 text-sm">
            {blocks.map((block) => (
              <li key={block.allocationId} className={`${cardClass} flex flex-wrap items-center justify-between gap-2 py-2`}>
                <span>
                  {t("details.title", { number: block.tableNumber })} ·{" "}
                  <span className="tabular-nums">
                    {zonedTime(block.startsAt, settings.timezone)}–{zonedTime(block.endsAt, settings.timezone)}
                  </span>
                  {block.reason && ` · ${block.reason}`}
                </span>
                <form action={unblockAction.bind(null, block.allocationId, returnTo)}>
                  <button className={secondaryButton}>{t("actions.unblock")}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
