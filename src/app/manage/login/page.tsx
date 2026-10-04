import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getStaff } from "@/server/auth/session";
import { StaffLocaleSwitcher } from "../StaffLocaleSwitcher";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getStaff()) redirect("/manage");
  const t = await getTranslations("manage");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Cavalieri Roof Garden</h1>
        <p className="mb-6 text-sm text-slate-600">{t("signInTitle")}</p>
        <LoginForm />
      </div>
      <StaffLocaleSwitcher />
    </main>
  );
}
