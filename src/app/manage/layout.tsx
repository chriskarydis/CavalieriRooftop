import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Commissioner, GFS_Didot } from "next/font/google";
import "../globals.css";

// The same two families as the public site.
const body = Commissioner({ subsets: ["latin", "greek"], variable: "--font-body", display: "swap" });
const heading = GFS_Didot({ weight: "400", subsets: ["latin", "greek"], variable: "--font-heading", display: "swap" });

// The management application is never linked from the public site and must not be indexed.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("manage");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function ManageRootLayout({ children }: LayoutProps<"/manage">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${body.variable} ${heading.variable} h-full antialiased`}>
      <body className="staff flex min-h-full flex-col text-slate-900">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
