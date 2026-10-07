import { getTranslations } from "next-intl/server";
import { ForbiddenError, requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getAnalytics } from "@/server/services/analytics";
import { audit } from "@/server/services/context";
import { csvDate, csvMoney, exportRange, exportReservations, toCsv, type Cell } from "@/server/services/export";

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

  if (kind === "reservations") {
    const reservations = await exportReservations(db, range);
    rows = [
      [
        t("reference"), t("date"), t("time"), t("guests"), t("table"), t("name"), t("phone"), t("email"), t("status"), t("source"),
        t("tableChoice"), t("occasion"), t("deposit"), t("tableFee"), t("total"), t("refunded"), t("guestNotes"), t("staffNotes"), t("bookedOn"),
      ],
      ...reservations.map((row): Cell[] => [
        row.reference,
        csvDate(row.date),
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
        csvMoney(row.depositCents),
        csvMoney(row.tableFeeCents),
        csvMoney(row.totalCents),
        csvMoney(row.refundedCents),
        row.guestNotes,
        row.staffNotes,
        csvDate(row.bookedOn),
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
    const percent = (value: number) => `${(value * 100).toFixed(1).replace(".", ",")}%`;
    rows = [
      [t("period"), `${csvDate(range.from)} - ${csvDate(range.to)}`],
      [],
      [tAnalytics("reservations"), data.reservations],
      [tAnalytics("covers"), data.covers],
      [t("averageParty"), data.averagePartySize.toFixed(1).replace(".", ",")],
      [tAnalytics("cancellations"), data.cancellations],
      [tAnalytics("noShows"), data.noShows],
      [t("noShowRate"), percent(data.noShowRate)],
      [tAnalytics("deposits"), csvMoney(data.depositCents)],
      [tAnalytics("tableFees"), csvMoney(data.tableFeeCents)],
      [tAnalytics("retained"), csvMoney(data.retainedCents)],
      [tAnalytics("refunded"), csvMoney(data.refundedCents)],
      [tAnalytics("chosenTable"), data.chosenTable],
      [t("autoAssigned"), data.autoAssigned],
      [tAnalytics("tableUse"), percent(data.tableUse)],
      [tAnalytics("walkIns"), data.walkIns],
      [t("walkInCovers"), data.walkInCovers],
      [tAnalytics("walkInsDrinks"), data.walkInsForDrinks],
      [],
      [tAnalytics("byHour"), t("reservationsCount")],
      ...data.byHour.map((row): Cell[] => [row.label, row.count]),
      [],
      [tAnalytics("byWeekday"), t("guests")],
      ...data.coversByWeekday.map((row): Cell[] => [tConfig(`settings.weekday.${row.weekday}`), row.covers]),
      [],
      [tAnalytics("chosenTables"), t("reservationsCount"), t("tableFee")],
      ...data.chosenTables.map((row): Cell[] => [row.tableNumber, row.count, csvMoney(row.feeCents)]),
      [],
      [tAnalytics("feeByCategory"), t("reservationsCount"), t("tableFee")],
      ...data.feeByCategory.map((row): Cell[] => [row.category, row.count, csvMoney(row.feeCents)]),
    ];
  }

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cavalieri-${kind}-${range.from}-${range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
