import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/site";
import { routing } from "@/i18n/routing";

const PAGES = ["", "/menu", "/reserve", "/contact", "/policy", "/privacy"] as const;

/** Public pages in every language. Checkout, manage-reservation and management pages are never listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PAGES.flatMap((page) =>
    routing.locales.map((locale) => ({
      url: `${base}/${locale}${page}`,
      changeFrequency: page === "/menu" ? ("weekly" as const) : ("monthly" as const),
      priority: page === "" ? 1 : page === "/reserve" ? 0.9 : 0.6,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((entry) => [entry, `${base}/${entry}${page}`])),
      },
    })),
  );
}
