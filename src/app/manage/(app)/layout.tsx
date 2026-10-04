import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/server/auth/session";
import { StaffLocaleSwitcher } from "../StaffLocaleSwitcher";
import { SignOutButton } from "./SignOutButton";

export default async function ManageAppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const t = await getTranslations("manage");

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <span className="font-semibold">Cavalieri Roof Garden</span>
        <div className="flex items-center gap-4 text-sm">
          <StaffLocaleSwitcher />
          <span className="text-slate-600">
            {staff.name} · {t(`role.${staff.role}`)}
          </span>
          <SignOutButton label={t("signOut")} />
        </div>
      </header>
      <div className="flex-1 p-4">{children}</div>
    </>
  );
}
