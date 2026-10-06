import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import logo from "@/assets/photos/logo.png";
import { getStaff } from "@/server/auth/session";
import { StaffLocaleSwitcher } from "../StaffLocaleSwitcher";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getStaff()) redirect("/manage");
  const t = await getTranslations("manage");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-white p-8 shadow-sm">
        <Image src={logo} alt="Cavalieri Roof Garden" priority sizes="220px" className="mx-auto h-20 w-auto" />
        <h1 className="mt-6 text-center">{t("signInTitle")}</h1>
        <LoginForm />
      </div>
      <StaffLocaleSwitcher />
    </main>
  );
}
