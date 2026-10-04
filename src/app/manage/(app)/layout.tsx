import { requireStaff } from "@/server/auth/session";
import { SignOutButton } from "./SignOutButton";

export default async function ManageAppLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();

  return (
    <>
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <span className="font-semibold">Cavalieri Roof Garden</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">
            {staff.name} · {staff.role === "DEVELOPER" ? "Developer" : "Manager"}
          </span>
          <SignOutButton />
        </div>
      </header>
      <div className="flex-1 p-4">{children}</div>
    </>
  );
}
