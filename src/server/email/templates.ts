import { createTranslator } from "next-intl";
import { SITE, siteUrl } from "@/config/site";
import { zonedTime } from "@/domain/time";
import { formatLongDate, intlLocale } from "@/i18n/intl-locale";
import { routing } from "@/i18n/routing";
import el from "@/messages/el.json";
import en from "@/messages/en.json";

/**
 * Email content in the guest's language (restaurant emails use the default
 * language). Every template returns HTML and a plain-text version.
 */

const MESSAGES = { en, el } as const;
type Locale = keyof typeof MESSAGES;

export type EmailTemplate =
  | "guest_confirmation"
  | "guest_cancellation"
  | "guest_reminder"
  | "guest_rescheduled"
  | "restaurant_rescheduled"
  | "restaurant_new"
  | "restaurant_cancelled"
  | "restaurant_no_show";

export interface EmailData {
  locale: string;
  reference: string;
  startsAt: Date;
  timezone: string;
  partySize: number;
  tableNumbers: number[];
  tableCategoryName: string | null;
  guestName: string;
  guestPhone: string | null;
  depositCents: number;
  tableFeeCents: number;
  totalCents: number;
  creditTowardBillCents: number;
  graceMinutes: number;
  refundCutoffHours: number;
  /** Secret token of the guest's manage link. */
  manageToken: string;
  /** For cancellations: what the policy refunds. */
  refundCents?: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The top of every email: the logo when the site has a public address an inbox
 * can load images from, otherwise the restaurant's name as text.
 */
function brandRow(): string {
  const base = siteUrl();
  if (!base.startsWith("https://")) {
    return `<tr><td style="padding:24px 24px 8px;font-size:13px;letter-spacing:1px;color:#a8481f">${escapeHtml(SITE.name.toUpperCase())}</td></tr>`;
  }
  return `<tr><td style="padding:24px 24px 8px"><img src="${escapeHtml(base)}/logo.png" alt="${escapeHtml(SITE.name)}" width="200" style="display:block;width:200px;height:auto;border:0"></td></tr>`;
}

function layout(heading: string, paragraphs: string[], rows: Array<[string, string]>, link?: { href: string; label: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#faf7f2;font-family:Arial,Helvetica,sans-serif;color:#1f2a30">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px">
${brandRow()}
<tr><td style="padding:0 24px 8px;font-size:22px;font-weight:bold">${escapeHtml(heading)}</td></tr>
${paragraphs.map((text) => `<tr><td style="padding:8px 24px;font-size:15px;line-height:1.5">${escapeHtml(text)}</td></tr>`).join("\n")}
${
  rows.length === 0
    ? ""
    : `<tr><td style="padding:12px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">
${rows
  .map(
    ([label, value]) =>
      `<tr><td style="padding:6px 0;color:#5b6870;border-bottom:1px solid #eee">${escapeHtml(label)}</td><td align="right" style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(value)}</td></tr>`,
  )
  .join("\n")}
</table></td></tr>`
}
${
  link
    ? `<tr><td style="padding:16px 24px"><a href="${escapeHtml(link.href)}" style="display:inline-block;background:#a8481f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold">${escapeHtml(link.label)}</a></td></tr>`
    : ""
}
<tr><td style="padding:16px 24px 24px;font-size:13px;line-height:1.5;color:#5b6870">${escapeHtml(SITE.name)} · ${escapeHtml(SITE.street)}, ${escapeHtml(SITE.postalCode)} ${escapeHtml(SITE.city.en)}<br>${escapeHtml(SITE.phone)} · ${escapeHtml(SITE.email)}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    heading,
    "",
    ...paragraphs,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(link ? ["", `${link.label}: ${link.href}`] : []),
    "",
    `${SITE.name} · ${SITE.street}, ${SITE.postalCode} ${SITE.city.en}`,
    `${SITE.phone} · ${SITE.email}`,
  ].join("\n");
  return { html, text };
}

export function renderEmail(template: EmailTemplate, data: EmailData): RenderedEmail {
  const forRestaurant = template.startsWith("restaurant_");
  const locale: Locale = !forRestaurant && data.locale in MESSAGES ? (data.locale as Locale) : routing.defaultLocale;
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "email" });
  const euro = (cents: number): string =>
    new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "EUR" }).format(cents / 100);

  const date = formatLongDate(data.startsAt, locale, data.timezone);
  const time = zonedTime(data.startsAt, data.timezone);
  const tables = data.tableNumbers.join(" + ") || "—";
  const manageUrl = `${siteUrl()}/${locale}/reservation/${data.manageToken}`;
  const values = {
    reference: data.reference,
    name: data.guestName,
    date,
    time,
    guests: data.partySize,
    minutes: data.graceMinutes,
    hours: data.refundCutoffHours,
    refund: euro(data.refundCents ?? 0),
  };

  const reservationRows: Array<[string, string]> = [
    [t("row.reference"), data.reference],
    [t("row.date"), date],
    [t("row.time"), time],
    [t("row.guests"), String(data.partySize)],
    [t("row.table"), tables],
  ];
  const paymentRows: Array<[string, string]> = [
    ...(data.tableFeeCents > 0 && data.tableCategoryName
      ? ([[t("row.category"), data.tableCategoryName]] as Array<[string, string]>)
      : []),
    [t("row.deposit"), euro(data.depositCents)],
    ...(data.tableFeeCents > 0 ? ([[t("row.tableFee"), euro(data.tableFeeCents)]] as Array<[string, string]>) : []),
    [t("row.total"), euro(data.totalCents)],
    [t("row.credit"), euro(data.creditTowardBillCents)],
  ];
  // The restaurant sees what it needs to prepare the table, not the guest's email address.
  const restaurantRows: Array<[string, string]> = [
    ...reservationRows,
    [t("row.guest"), data.guestName],
    ...(data.guestPhone ? ([[t("row.phone"), data.guestPhone]] as Array<[string, string]>) : []),
    [t("row.deposit"), euro(data.depositCents)],
    [t("row.tableFee"), euro(data.tableFeeCents)],
  ];

  const subject = t(`${template}.subject`, values);
  const heading = t(`${template}.heading`, values);

  switch (template) {
    case "guest_confirmation":
      return {
        subject,
        ...layout(
          heading,
          [t("guest_confirmation.intro", values), t("policy.minimum"), t("policy.grace", values), t("policy.refund", values)],
          [...reservationRows, ...paymentRows],
          { href: manageUrl, label: t("manageLink") },
        ),
      };
    case "guest_reminder":
      return {
        subject,
        ...layout(heading, [t("guest_reminder.intro", values), t("policy.grace", values)], reservationRows, {
          href: manageUrl,
          label: t("manageLink"),
        }),
      };
    case "guest_rescheduled":
      return {
        subject,
        ...layout(heading, [t("guest_rescheduled.intro", values), t("policy.grace", values), t("policy.refund", values)], reservationRows, {
          href: manageUrl,
          label: t("manageLink"),
        }),
      };
    case "guest_cancellation":
      return {
        subject,
        ...layout(
          heading,
          [t((data.refundCents ?? 0) > 0 ? "guest_cancellation.refund" : "guest_cancellation.noRefund", values)],
          reservationRows,
        ),
      };
    case "restaurant_cancelled":
      return {
        subject,
        ...layout(heading, [t("restaurant_cancelled.intro", values)], restaurantRows),
      };
    default:
      return { subject, ...layout(heading, [t(`${template}.intro`, values)], restaurantRows) };
  }
}
