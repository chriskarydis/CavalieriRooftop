import { getTranslations } from "next-intl/server";
import { BLOCK_HOURS } from "./block-hours";
import type { BlockLabels, NewReservationLabels } from "./StaffDialogs";

export async function newReservationLabels(): Promise<NewReservationLabels> {
  const t = await getTranslations("manage.newReservation");
  const tMove = await getTranslations("manage.move");
  return {
    button: t("button"),
    title: t("title"),
    name: t("name"),
    phone: t("phone"),
    email: t("email"),
    emailHint: t("emailHint"),
    guests: t("guests"),
    date: t("date"),
    time: t("time"),
    table: t("table"),
    auto: t("auto"),
    language: t("language"),
    greek: t("greek"),
    english: t("english"),
    notes: t("notes"),
    note: t("note"),
    confirm: t("confirm"),
    close: tMove("close"),
  };
}

export async function blockLabels(): Promise<Omit<BlockLabels, "hours"> & { hours: string[] }> {
  const t = await getTranslations("manage.block");
  const tMove = await getTranslations("manage.move");
  return {
    button: t("button"),
    title: t("title"),
    from: t("from"),
    now: t("now"),
    later: t("later"),
    date: t("date"),
    time: t("time"),
    until: t("until"),
    closing: t("closing"),
    forHours: t("forHours"),
    hours: BLOCK_HOURS.map((count) => t("hours", { hours: count })),
    reason: t("reason"),
    reasonHint: t("reasonHint"),
    confirm: t("confirm"),
    close: tMove("close"),
  };
}
