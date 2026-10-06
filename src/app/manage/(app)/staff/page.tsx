import { getTranslations } from "next-intl/server";
import { STAFF_ROLES } from "@/domain/permissions";
import { requirePermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listStaff, MIN_PASSWORD_LENGTH } from "@/server/services/staff";
import { cardClass, inputClass, Notice, primaryButton, secondaryButton } from "../ui";
import { addStaff, changeRole, deleteStaff, resetPassword } from "./actions";

export default async function StaffPage({ searchParams }: PageProps<"/manage/staff">) {
  const me = await requirePermission("system");
  const t = await getTranslations("staff");
  const tManage = await getTranslations("manage");
  const query = await searchParams;
  const staff = await listStaff(db);

  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-slate-600">{t("intro")}</p>
      </header>
      <Notice query={query} />

      <ul className="space-y-3">
        {staff.map((member) => (
          <li key={member.id} className={cardClass}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p>
                <span className="font-semibold">{member.name}</span>{" "}
                <span className="text-sm text-slate-600">
                  {member.email} · {tManage(`role.${member.role}`)}
                  {member.id === me.id && ` · ${t("you")}`}
                </span>
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3 text-sm">
              <form action={changeRole.bind(null, member.id)} className="flex items-end gap-2">
                <label className="font-medium">
                  {t("role")}
                  <select name="role" defaultValue={member.role} className={inputClass}>
                    {STAFF_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {tManage(`role.${role}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className={secondaryButton}>
                  {t("changeRole")}
                </button>
              </form>

              <form action={resetPassword.bind(null, member.id)} className="flex items-end gap-2">
                <label className="font-medium">
                  {t("newPassword", { min: MIN_PASSWORD_LENGTH })}
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </label>
                <button type="submit" className={secondaryButton}>
                  {t("resetPassword")}
                </button>
              </form>

              {member.id !== me.id && (
                <details>
                  <summary className={`${secondaryButton} cursor-pointer list-none text-red-800`}>{t("remove")}</summary>
                  <form action={deleteStaff.bind(null, member.id)} className="mt-1">
                    <button type="submit" className="rounded-md bg-red-700 px-2 py-1 text-sm text-white">
                      {t("confirmRemove", { name: member.name })}
                    </button>
                  </form>
                </details>
              )}
            </div>
          </li>
        ))}
      </ul>

      <section className={cardClass}>
        <h2 className="font-semibold">{t("new")}</h2>
        <p className="mb-3 text-sm text-slate-600">{t("newNote")}</p>
        <form action={addStaff} className="grid gap-3 text-sm font-medium sm:grid-cols-2">
          <label>
            {t("name")}
            <input name="name" required minLength={2} maxLength={120} autoComplete="off" className={inputClass} />
          </label>
          <label>
            {t("email")}
            <input name="email" type="email" required maxLength={200} autoComplete="off" className={inputClass} />
          </label>
          <label>
            {t("role")}
            <select name="role" defaultValue="MANAGER" className={inputClass}>
              {STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {tManage(`role.${role}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("initialPassword", { min: MIN_PASSWORD_LENGTH })}
            <input
              name="password"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className={primaryButton}>
              {t("create")}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
