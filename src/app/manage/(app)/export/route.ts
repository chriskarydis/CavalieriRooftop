import { getTranslations } from "next-intl/server";
import { ForbiddenError, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getAnalytics } from "@/server/services/analytics";
import { audit } from "@/server/services/context";
import { exportRange, exportReservations, sheetDate } from "@/server/services/export";
import { writeXlsx, XLSX_CONTENT_TYPE, type SheetCell } from "@/server/services/xlsx";

type Cell = SheetCell;
const money = (cents: number): Cell => ({ euros: cents / 100 });

/**
 * Downloads for the manager: every reservation of a period, or the period's
 * figures, as a file that opens in Excel. Reservations carry guests' contact
 * details, so each download is recorded.
 */
export async function GET(request: Request): Promise<Response> {
  let staff;
  try {
    staff = await requirePermission("analytics");
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    throw error;
  }
  const url = new URL(request.url);
  const range = exportRange(url.searchParams.get("from"), url.searchParams.get("to"));
  if (!range) return new Response("Bad request", { status: 400 });
  const kind = url.searchParams.get("kind") === "summary" ? "summary" : "reservations";

  const t = await getTranslations("export");
  const tManage = await getTranslations("manage");
  const tAnalytics = await getTranslations("analytics");
  const tConfig = await getTranslations("config");
  let rows: Cell[][];
  // The first row of each table is written in bold.
  const boldRows = [0];

  if (kind === "reservations") {
    const reservations = await exportReservations(db, range);
    rows = [
      [
        t("reference"), t("date"), t("time"), t("guests"), t("table"), t("name"), t("phone"), t("email"), t("status"), t("source"),
        t("tableChoice"), t("occasion"), t("deposit"), t("tableFee"), t("total"), t("refunded"), t("guestNotes"), t("staffNotes"), t("bookedOn"),
      ],
      ...reservations.map((row): Cell[] => [
        row.reference,
        sheetDate(row.date),
        row.time,
        row.partySize,
        row.tableNumbers.join(" + "),
        row.guestName,
        row.guestPhone,
        row.guestEmail,
        tManage(`booking.${row.status}`),
        t(`sourceValue.${row.source}`),
        t(`choiceValue.${row.selectionMode}`),
        row.occasion ? tManage(`occasion.${row.occasion}`) : "",
        money(row.depositCents),
        money(row.tableFeeCents),
        money(row.totalCents),
        money(row.refundedCents),
        row.guestNotes,
        row.staffNotes,
        sheetDate(row.bookedOn),
      ]),
    ];
    await audit(db, {
      actor: staff.id,
      action: "export.reservations",
      entityType: "export",
      entityId: `${range.from}..${range.to}`,
      after: { rows: reservations.length },
    });
  } else {
    const data = await getAnalytics(db, range);
    const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
    const heading = (row: Cell[]): Cell[] => {
      boldRows.push(rows.length);
      return row;
    };
    rows = [
      [t("period"), `${sheetDate(range.from)} - ${sheetDate(range.to)}`],
      [tAnalytics("reservations"), data.reservations],
      [tAnalytics("covers"), data.covers],
      [t("averageParty"), Math.round(data.averagePartySize * 10) / 10],
      [tAnalytics("cancellations"), data.cancellations],
      [tAnalytics("noShows"), data.noShows],
      [t("noShowRate"), percent(data.noShowRate)],
      [tAnalytics("deposits"), money(data.depositCents)],
      [tAnalytics("tableFees"), money(data.tableFeeCents)],
      [tAnalytics("retained"), money(data.retainedCents)],
      [tAnalytics("refunded"), money(data.refundedCents)],
      [tAnalytics("chosenTable"), data.chosenTable],
      [t("autoAssigned"), data.autoAssigned],
      [tAnalytics("tableUse"), percent(data.tableUse)],
      [tAnalytics("walkIns"), data.walkIns],
      [t("walkInCovers"), data.walkInCovers],
      [tAnalytics("walkInsDrinks"), data.walkInsForDrinks],
    ];
    rows.push([], heading([tAnalytics("byHour"), t("reservationsCount")]));
    rows.push(
      ...data.byHour.map((row): Cell[] => [row.label, row.count]),
    );
    rows.push([], heading([tAnalytics("byWeekday"), t("guests")]));
    rows.push(
      ...data.coversByWeekday.map((row): Cell[] => [tConfig(`settings.weekday.${row.weekday}`), row.covers]),
    );
    rows.push([], heading([tAnalytics("chosenTables"), t("reservationsCount"), t("tableFee")]));
    rows.push(
      ...data.chosenTables.map((row): Cell[] => [row.tableNumber, row.count, money(row.feeCents)]),
    );
    rows.push([], heading([tAnalytics("feeByCategory"), t("reservationsCount"), t("tableFee")]));
    rows.push(
      ...data.feeByCategory.map((row): Cell[] => [row.category, row.count, money(row.feeCents)]),
    );
  }

  const file = writeXlsx({ name: kind === "summary" ? t("sheetSummary") : t("sheetReservations"), rows, boldRows });
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="cavalieri-${kind}-${range.from}-${range.to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
