import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import "../globals.css";

// The management application is never linked from the public site and must not be indexed.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("manage");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function ManageRootLayout({ children }: LayoutProps<"/manage">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-slate-50 text-slate-900">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
