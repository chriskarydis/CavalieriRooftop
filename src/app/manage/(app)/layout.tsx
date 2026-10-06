import Image from "next/image";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { hasPermission } from "@/domain/permissions";
import logoOnDark from "@/assets/photos/logo-on-dark.png";
import { SITE } from "@/config/site";
import { requireStaff } from "@/server/auth/session";
import { StaffLocaleSwitcher } from "../StaffLocaleSwitcher";
import { NavLinks } from "./NavLinks";
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
      <header className="bg-night px-4 text-stone-300 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 py-3">
          <Link href="/manage" className="flex items-center gap-4">
            <Image src={logoOnDark} alt="Cavalieri Roof Garden" priority sizes="160px" className="h-11 w-auto" />
            <span className="hidden border-l border-white/20 pl-4 text-[0.7rem] tracking-[0.24em] text-gold uppercase sm:inline">
              {t("title")}
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <StaffLocaleSwitcher />
            <Link href="/manage/account" className="hover:text-white">
              {staff.name} · {t(`role.${staff.role}`)}
            </Link>
            <SignOutButton label={t("signOut")} />
          </div>
        </div>
        <NavLinks label={t("nav.label")} links={links.map((link) => ({ href: link.href, label: t(`nav.${link.key}`) }))} />
      </header>
      <div className="flex-1 px-4 py-6 sm:px-6">{children}</div>
      <footer className="bg-night px-4 py-5 text-xs text-stone-400 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p>
            <span className="tracking-[0.2em] text-gold uppercase">{SITE.name}</span>
            {" · "}
            {SITE.street}, {SITE.postalCode} {SITE.city.en} · {SITE.phone}
          </p>
          <p className="flex flex-wrap gap-x-5">
            <a href="/" target="_blank" rel="noopener" className="hover:text-white">
              {t("footer.publicSite")}
            </a>
            <span>{t("footer.staffOnly")}</span>
          </p>
        </div>
      </footer>
    </>
  );
}
