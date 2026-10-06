"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The management menu, with the current page marked. */
export function NavLinks({ label, links }: { label: string; links: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mb-px flex gap-x-6 overflow-x-auto text-[0.7rem] font-medium tracking-[0.16em] whitespace-nowrap uppercase">
      {links.map((link) => {
        const current = link.href === "/manage" ? pathname === "/manage" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={`border-b-2 py-3 ${current ? "border-gold text-white" : "border-transparent text-stone-400 hover:text-white"}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
