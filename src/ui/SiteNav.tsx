"use client";

import { Link, usePathname } from "@/i18n/navigation";

/** The public site's main links, with the page the visitor is on underlined in dark. */
export function SiteNav({ label, links }: { label: string; links: Array<{ href: string; label: string }> }) {
  // Without the language: "/menu" on both /en/menu and /el/menu.
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className="order-3 flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs font-medium tracking-[0.2em] uppercase sm:gap-x-7 md:order-2 md:w-auto md:flex-1 md:justify-end"
    >
      {links.map((link) => {
        // The guest's own reservation pages count as "My reservation".
        const current =
          pathname === link.href ||
          pathname.startsWith(`${link.href}/`) ||
          (link.href === "/my-reservation" && pathname.startsWith("/reservation/"));
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={`border-b-2 pb-1 ${current ? "border-ink text-ink" : "border-transparent text-ink/70 hover:border-gold hover:text-ink"}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
