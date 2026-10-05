import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { addMinutes, zonedDate, zonedTime } from "@/domain/time";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { loadSettings } from "@/server/services/context";
import { getTimeline, type TimelineEntry } from "@/server/services/timeline";
import { AutoRefresh } from "../AutoRefresh";
import { cardClass, inputClass, primaryButton, secondaryButton } from "../ui";

const HOUR_MINUTES = 60;
const DAY_MINUTES = 24 * 60;

type Tone = "reserved" | "seated" | "late" | "done" | "walkIn" | "block" | "hold";

/** A light fill with a strong edge: the label stays in normal text colour. */
const TONE_CLASS: Record<Tone, string> = {
  reserved: "border-blue-700 bg-blue-100",
  seated: "border-rose-700 bg-rose-100",
  late: "border-orange-600 bg-orange-100",
  done: "border-slate-400 bg-slate-100",
  walkIn: "border-teal-700 bg-teal-100",
  block: "border-slate-700 bg-slate-300",
  hold: "border-amber-500 bg-amber-100",
};
const TONES = Object.keys(TONE_CLASS) as Tone[];

function toneOf(entry: TimelineEntry): Tone {
  if (entry.kind === "WALK_IN") return "walkIn";
  if (entry.kind === "BLOCK") return "block";
  if (entry.kind === "HOLD") return "hold";
  if (entry.status === "SEATED") return "seated";
  if (entry.status === "LATE") return "late";
  if (entry.status === "COMPLETED") return "done";
  return "reserved";
}

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export default async function TimelinePage({ searchParams }: PageProps<"/manage/timeline">) {
  await requirePermission("operations");
  const t = await getTranslations("timeline");
  const settings = await loadSettings(db);
  const requested = first((await searchParams).date);
  const today = zonedDate(new Date(), settings.timezone);
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
  const timeline = await getTimeline(db, date);

  const start = timeline.windowStart.getTime();
  const span = timeline.windowEnd.getTime() - start;
  const percent = (instant: Date): number => Math.min(100, Math.max(0, ((instant.getTime() - start) / span) * 100));
  const hours = Array.from({ length: span / (HOUR_MINUTES * 60_000) + 1 }, (_, index) =>
    addMinutes(timeline.windowStart, index * HOUR_MINUTES),
  );
  const time = (instant: Date): string => zonedTime(instant, settings.timezone);
  const shift = (days: number): string =>
    zonedDate(addMinutes(new Date(`${date}T12:00:00Z`), days * DAY_MINUTES), "UTC");

  return (
    <main className="space-y-4">
      {date === today && <AutoRefresh />}
      <h1 className="text-lg font-semibold">{t("title")}</h1>

      <form method="get" className={`${cardClass} flex flex-wrap items-end gap-3 text-sm font-medium`}>
        <label>
          {t("date")}
          <input type="date" name="date" defaultValue={date} required className={inputClass} />
        </label>
        <button type="submit" className={primaryButton}>
          {t("show")}
        </button>
        <Link href={`/manage/timeline?date=${shift(-1)}`} className={secondaryButton}>
          {t("previous")}
        </Link>
        <Link href={`/manage/timeline?date=${shift(1)}`} className={secondaryButton}>
          {t("next")}
        </Link>
        <Link href="/manage/timeline" className={secondaryButton}>
          {t("today")}
        </Link>
      </form>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {TONES.map((tone) => (
          <li key={tone} className="flex items-center gap-1.5">
            <span aria-hidden className={`inline-block h-3 w-4 rounded-sm border-l-4 ${TONE_CLASS[tone]}`} />
            {t(`tone.${tone}`)}
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="min-w-[56rem]">
          <div className="flex border-b border-slate-200 text-xs text-slate-600">
            <div className="w-20 shrink-0 px-2 py-1.5 font-medium">{t("table")}</div>
            <div className="relative h-7 flex-1">
              {hours.map((hour) => (
                <span key={hour.toISOString()} className="absolute top-1.5 -translate-x-1/2 tabular-nums" style={{ left: `${percent(hour)}%` }}>
                  {time(hour)}
                </span>
              ))}
            </div>
            <div className="w-6 shrink-0" />
          </div>

          {timeline.tables.map((table) => (
            <div key={table.tableId} className="flex border-b border-slate-100 last:border-0">
              <div className={`w-20 shrink-0 px-2 py-2 text-sm ${table.active ? "" : "text-slate-400"}`}>
                <span className="font-semibold">{table.number}</span>{" "}
                <span className="text-xs text-slate-500">({table.capacity})</span>
              </div>
              <div className="relative h-10 flex-1">
                {hours.map((hour) => (
                  <span key={hour.toISOString()} aria-hidden className="absolute inset-y-0 border-l border-slate-100" style={{ left: `${percent(hour)}%` }} />
                ))}
                {table.entries.map((entry) => {
                  const left = percent(entry.startsAt);
                  const label = entry.label ?? t(`tone.${toneOf(entry)}`);
                  const detail = `${time(entry.startsAt)}–${time(entry.endsAt)} · ${label}${entry.partySize ? ` · ${entry.partySize}` : ""}${entry.reference ? ` · ${entry.reference}` : ""} · ${t(`tone.${toneOf(entry)}`)}`;
                  return (
                    <div
                      key={entry.allocationId}
                      title={detail}
                      className={`absolute inset-y-1 overflow-hidden rounded-r border-l-4 px-1.5 text-xs leading-8 whitespace-nowrap text-slate-900 ${TONE_CLASS[toneOf(entry)]}`}
                      style={{ left: `${left}%`, width: `${Math.max(0.5, percent(entry.endsAt) - left)}%` }}
                    >
                      <span className="sr-only">{detail}</span>
                      <span aria-hidden>
                        {time(entry.startsAt)} {label}
                        {entry.partySize ? ` · ${entry.partySize}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="w-6 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
