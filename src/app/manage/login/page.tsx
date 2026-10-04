import { redirect } from "next/navigation";
import { getStaff } from "@/server/auth/session";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getStaff()) redirect("/manage");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Cavalieri Roof Garden</h1>
        <p className="mb-6 text-sm text-slate-600">Staff sign-in</p>
        <LoginForm />
      </div>
    </main>
  );
}
