"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface NavItem {
  href: string;
  label: string;
  /** One line under the name, for the setup pages. */
  hint?: string;
}

const isCurrent = (href: string, pathname: string): boolean => (href === "/manage" ? pathname === "/manage" : pathname.startsWith(href));

/**
 * The management menu in three parts: the pages used every evening, the
 * reports, and the setup pages, which are kept in a menu of their own because
 * they are only needed now and then.
 */
export function NavLinks({
  label,
  daily,
  reports,
  setup,
  setupLabel,
}: {
  label: string;
  daily: NavItem[];
  reports: NavItem[];
  setup: NavItem[];
  setupLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const inSetup = setup.some((item) => isCurrent(item.href, pathname));

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const tab = (item: NavItem, strong: boolean) => {
    const current = isCurrent(item.href, pathname);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={current ? "page" : undefined}
        className={`border-b-2 py-3 ${current ? "border-gold text-white" : `border-transparent hover:text-white ${strong ? "text-stone-200" : "text-stone-400"}`}`}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <nav aria-label={label} className="-mb-px flex items-stretch justify-between gap-6 text-[0.7rem] font-medium tracking-[0.16em] whitespace-nowrap uppercase">
      <div className="flex min-w-0 items-stretch gap-x-6 overflow-x-auto">
        {daily.map((item) => tab(item, true))}
        {reports.length > 0 && (
          <>
            <span aria-hidden className="my-3 w-px shrink-0 bg-white/20" />
            {reports.map((item) => tab(item, false))}
          </>
        )}
      </div>

      {setup.length > 0 && (
        <div ref={box} className="relative shrink-0">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className={`flex h-full items-center gap-2 border-b-2 py-3 tracking-[0.16em] uppercase ${inSetup ? "border-gold text-white" : "border-transparent text-stone-400 hover:text-white"}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
            </svg>
            {setupLabel}
            <span aria-hidden>{open ? "▴" : "▾"}</span>
          </button>
          {open && (
            <ul className="absolute top-full right-0 z-40 mt-1 w-72 rounded-lg border border-line bg-white py-2 text-sm tracking-normal whitespace-normal text-slate-900 normal-case shadow-xl">
              {setup.map((item) => {
                const current = isCurrent(item.href, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={`block border-l-2 px-4 py-2 hover:bg-stone-50 ${current ? "border-gold bg-stone-50" : "border-transparent"}`}
                    >
                      <span className="block font-medium">{item.label}</span>
                      {item.hint && <span className="block text-xs text-slate-500">{item.hint}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </nav>
  );
}
