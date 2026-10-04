import type { LiveTableState } from "@/domain/table-state";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getFloorPlanView } from "@/server/floor/queries";
import { getLiveFloor } from "@/server/services/live-floor";
import { FloorPlan } from "@/ui/floor-plan/FloorPlan";

const STATE_STYLE: Record<LiveTableState, { label: string; color: string }> = {
  AVAILABLE: { label: "Available", color: "#3f9b6b" },
  RESERVED: { label: "Reserved later", color: "#4a78b5" },
  ARRIVING: { label: "Arriving", color: "#7a5cc0" },
  LATE: { label: "Late", color: "#d9822b" },
  OCCUPIED: { label: "Occupied", color: "#b23a48" },
  HELD: { label: "Being reserved", color: "#e0a030" },
  BLOCKED: { label: "Blocked", color: "#5b6870" },
  OUT_OF_SERVICE: { label: "Out of service", color: "#9aa5ab" },
  INACTIVE: { label: "Inactive", color: "#c5ccd0" },
};

const AREA_LABELS: Record<string, string> = { toilets: "Toilets", entrance: "Entrance", kitchen: "Kitchen", bar: "Bar" };

export default async function LiveFloorPage() {
  await requirePermission("operations");
  const [plan, live] = await Promise.all([getFloorPlanView(), getLiveFloor(db)]);
  if (!plan) return <p>No floor plan has been configured yet.</p>;

  const liveById = new Map(live.map((table) => [table.tableId, table]));
  const tables = plan.tables.map((table) => {
    const state = liveById.get(table.id)?.state ?? "AVAILABLE";
    return { ...table, color: STATE_STYLE[state].color, muted: false };
  });
  const time = new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: "Europe/Athens" });
  const upcoming = live
    .flatMap((table) => table.bookings.map((booking) => ({ table: table.number, ...booking })))
    .filter((booking) => booking.kind !== "HOLD")
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.table - b.table);

  return (
    <main className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_1fr]">
      <section aria-labelledby="floor-heading">
        <h1 id="floor-heading" className="mb-2 text-lg font-semibold">
          Live floor
        </h1>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <FloorPlan
            plan={{ ...plan, tables }}
            title="Live floor plan"
            areaLabel={(key) => AREA_LABELS[key] ?? key}
            tableLabel={(table) =>
              `Table ${table.number}, ${table.capacity} seats, ${STATE_STYLE[liveById.get(table.id)?.state ?? "AVAILABLE"].label}`
            }
          />
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {Object.values(STATE_STYLE).map((style) => (
            <li key={style.label} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3 rounded-sm" style={{ background: style.color }} />
              {style.label}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tonight-heading">
        <h2 id="tonight-heading" className="mb-2 text-lg font-semibold">
          Now and next 12 hours
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-slate-600">Nothing booked.</p>
        ) : (
          <table className="w-full rounded-xl border border-slate-200 bg-white text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Table</th>
                <th className="px-3 py-2 font-medium">Guest</th>
                <th className="px-3 py-2 font-medium">Party</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((booking) => (
                <tr key={`${booking.table}-${booking.startsAt.toISOString()}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">{time.format(booking.startsAt)}</td>
                  <td className="px-3 py-2">{booking.table}</td>
                  <td className="px-3 py-2">{booking.guestName ?? (booking.kind === "WALK_IN" ? "Walk-in" : "—")}</td>
                  <td className="px-3 py-2">{booking.partySize ?? "—"}</td>
                  <td className="px-3 py-2">{booking.reservationStatus ?? booking.kind}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
