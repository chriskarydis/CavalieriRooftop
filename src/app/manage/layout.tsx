import type { Metadata } from "next";
import "../globals.css";

// The management application is never linked from the public site and must not be indexed.
export const metadata: Metadata = {
  title: "Cavalieri Roof Garden · Management",
  robots: { index: false, follow: false },
};

export default function ManageRootLayout({ children }: LayoutProps<"/manage">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
