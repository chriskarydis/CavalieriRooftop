import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/server/auth/session";
import { MIN_PASSWORD_LENGTH } from "@/server/services/staff";
import { cardClass } from "../ui";
import { PasswordForm } from "./PasswordForm";

export default async function AccountPage() {
  const staff = await requireStaff();
  const t = await getTranslations("staff");

  return (
    <main className="mx-auto max-w-xl space-y-4">
      <header>
        <h1 className="text-lg font-semibold">{t("accountTitle")}</h1>
        <p className="text-sm text-slate-600">
          {staff.name} · {staff.email}
        </p>
      </header>
      <section className={cardClass}>
        <h2 className="mb-3 font-semibold">{t("changePassword")}</h2>
        <PasswordForm minLength={MIN_PASSWORD_LENGTH} />
      </section>
    </main>
  );
}
