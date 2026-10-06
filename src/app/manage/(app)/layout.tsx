import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { hasPermission } from "@/domain/permissions";
import { requireStaff } from "@/server/auth/session";
import { StaffLocaleSwitcher } from "../StaffLocaleSwitcher";
import { SignOutButton } from "./SignOutButton";

const OPERATIONS = [
  { href: "/manage", key: "floor" },
  { href: "/manage/reservations", key: "reservations" },
  { href: "/manage/timeline", key: "timeline" },
] as const;

const CONFIGURATION = [
  { href: "/manage/tables", key: "tables" },
  { href: "/manage/floor", key: "floor_editor" },
  { href: "/manage/categories", key: "categories" },
  { href: "/manage/combinations", key: "combinations" },
  { href: "/manage/menu", key: "menu" },
  { href: "/manage/settings", key: "settings" },
] as const;

export default async function ManageAppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const t = await getTranslations("manage");
  const links = [
    ...OPERATIONS,
    ...(hasPermission(staff.role, "analytics") ? [{ href: "/manage/analytics", key: "analytics" } as const] : []),
    ...(hasPermission(staff.role, "configuration") ? CONFIGURATION : []),
    ...(hasPermission(staff.role, "system") ? [{ href: "/manage/staff", key: "staff" } as const] : []),
  ];

  return (
    <>
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-semibold">Cavalieri Roof Garden</span>
          <div className="flex items-center gap-4 text-sm">
            <StaffLocaleSwitcher />
            <Link href="/manage/account" className="text-slate-600 hover:underline">
              {staff.name} · {t(`role.${staff.role}`)}
            </Link>
            <SignOutButton label={t("signOut")} />
          </div>
        </div>
        <nav aria-label={t("nav.label")} className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-slate-700 hover:underline">
              {t(`nav.${link.key}`)}
            </Link>
          ))}
        </nav>
      </header>
      <div className="flex-1 p-4">{children}</div>
    </>
  );
}
