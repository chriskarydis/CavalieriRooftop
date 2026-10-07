import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { zonedDate, zonedTime } from "@/domain/time";
import { formatCalendarDate } from "@/i18n/intl-locale";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { loadSettings } from "@/server/services/context";
import { getGuestProfile } from "@/server/services/guest-history";
import { saveGuestNoteAction } from "../../../actions";
import { cardClass, inputClass, primaryButton } from "../../ui";

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * One guest across all their reservations, recognised by email address or
 * phone number: how often they came, and the restaurant's standing note.
 */
export default async function GuestPage({ params, searchParams }: PageProps<"/manage/guests/[customerId]">) {
  await requirePermission("operations");
  const { customerId } = await params;
  const query = await searchParams;
  const t = await getTranslations("manage");
  const profile = /^[0-9a-f-]{36}$/.test(customerId) ? await getGuestProfile(db, customerId) : null;
  if (!profile) notFound();
  const settings = await loadSettings(db);
  const { stats } = profile;
  const error = first(query.error);

  const tiles = [
    { label: t("guest.total"), value: stats.reservations },
    { label: t("guest.came"), value: stats.visits },
    { label: t("guest.noShowCount"), value: stats.noShows },
    { label: t("guest.cancelledCount"), value: stats.cancelled },
  ];

  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <header>
        <p className="text-sm">
          <Link href="/manage/reservations" className="text-slate-600 hover:underline">
            ← {t("reservations.title")}
          </Link>
        </p>
        <h1 className="mt-1 text-lg font-semibold">{profile.name}</h1>
        <p className="text-sm text-slate-600">{[profile.phone, profile.email].filter(Boolean).join(" · ") || t("guest.noContact")}</p>
      </header>

      {first(query.done) === "1" && !error && (
        <p role="status" className="rounded border border-emerald-300 bg-emerald-50 p-3 font-medium text-emerald-900">
          {t("guest.noteSaved")}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          {t.has(`errors.${error}`) ? t(`errors.${error}`, { time: "" }) : t("errors.GENERIC")}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={cardClass}>
            <dt className="text-sm text-slate-600">{tile.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</dd>
          </div>
        ))}
      </dl>

      <section className={cardClass}>
        <h2 className="mb-1 font-semibold">{t("guest.standingNote")}</h2>
        <p className="mb-3 text-sm text-slate-600">{t("guest.standingHint")}</p>
        <form action={saveGuestNoteAction.bind(null, profile.customerId, `/manage/guests/${profile.customerId}`)} className="space-y-3">
          <textarea name="note" rows={3} maxLength={1000} defaultValue={stats.note ?? ""} aria-label={t("guest.standingNote")} className={inputClass} />
          <button type="submit" className={primaryButton}>
            {t("guest.saveNote")}
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">{t("guest.history")}</h2>
        <div className="overflow-x-auto rounded-lg border border-line bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">{t("reservations.date")}</th>
                <th className="px-3 py-2 font-medium">{t("columns.time")}</th>
                <th className="px-3 py-2 font-medium">{t("columns.party")}</th>
                <th className="px-3 py-2 font-medium">{t("columns.status")}</th>
                <th className="px-3 py-2 font-medium">{t("guest.notes")}</th>
              </tr>
            </thead>
            <tbody>
              {profile.reservations.map((row) => {
                const date = zonedDate(row.startsAt, settings.timezone);
                return (
                  <tr key={row.reservationId} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-3 py-2 tabular-nums">
                      <Link href={`/manage/reservations?date=${date}`} className="underline decoration-stone-300 underline-offset-2 hover:decoration-ink">
                        {formatCalendarDate(date)}
                      </Link>
                      <span className="block text-xs text-slate-500">{row.reference}</span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{zonedTime(row.startsAt, settings.timezone)}</td>
                    <td className="px-3 py-2">{row.partySize}</td>
                    <td className="px-3 py-2">{t(`booking.${row.status}`)}</td>
                    <td className="px-3 py-2 text-xs text-slate-700">
                      {row.occasion && <span className="mb-0.5 block w-fit rounded bg-amber-100 px-1.5 py-0.5 text-amber-950">{t(`occasion.${row.occasion}`)}</span>}
                      {[row.staffNotes, row.guestNotes].filter(Boolean).join(" · ") || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
