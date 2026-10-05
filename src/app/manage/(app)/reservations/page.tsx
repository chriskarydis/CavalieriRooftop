import { getFormatter, getTranslations } from "next-intl/server";
import { RESERVATION_STATUSES, type ReservationStatus } from "@/domain/reservation-state";
import { addMinutes, zonedDate, zonedTime, zonedToInstant } from "@/domain/time";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { loadSettings } from "@/server/services/context";
import { listReservations } from "@/server/services/reservation-list";
import { listBlocks } from "@/server/services/table-ops";
import { unblockAction } from "../../actions";
import { ReservationActions } from "../ReservationActions";
import { cardClass, inputClass, primaryButton, secondaryButton } from "../ui";

const LISTED_STATUSES = RESERVATION_STATUSES.filter((status) => status !== "PENDING_PAYMENT" && status !== "EXPIRED");
const DAY_MINUTES = 24 * 60;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export default async function ReservationsPage({ searchParams }: PageProps<"/manage/reservations">) {
  await requirePermission("operations");
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

  const dayStart = zonedToInstant(date, "00:00", settings.timezone);
  const [reservations, blocks] = await Promise.all([
    listReservations(db, { date, status, search }),
    listBlocks(db, dayStart, addMinutes(dayStart, DAY_MINUTES)),
  ]);
  const returnTo = `/manage/reservations?${new URLSearchParams({ date, ...(status ? { status } : {}), ...(search ? { q: search } : {}) })}`;
  const euro = (cents: number) =>
    format.number(cents / 100, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const covers = reservations
    .filter((reservation) => !["CANCELLED", "NO_SHOW"].includes(reservation.status))
    .reduce((sum, reservation) => sum + reservation.partySize, 0);

  return (
    <main className="mx-auto max-w-6xl space-y-4">
      <h1 className="text-lg font-semibold">{t("reservations.title")}</h1>

      <form method="get" className={`${cardClass} flex flex-wrap items-end gap-3 text-sm font-medium`}>
        <label>
          {t("reservations.date")}
          <input type="date" name="date" defaultValue={date} required className={inputClass} />
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

      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          {t.has(`errors.${error}`) ? t(`errors.${error}`, { time: "" }) : t("errors.GENERIC")}
        </p>
      )}

      <p className="text-sm text-slate-600">{t("reservations.summary", { count: reservations.length, covers })}</p>

      {reservations.length > 0 && (
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
                  </td>
                  <td className="px-3 py-2">
                    <ReservationActions reservationId={reservation.id} status={reservation.status} returnTo={returnTo} />
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
