"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { authClient } from "@/ui/auth-client";

type Outcome = "idle" | "saved" | "wrong" | "mismatch" | "failed";

/** Lets any staff member change their own password. Other devices are signed out. */
export function PasswordForm({ minLength }: { minLength: number }) {
  const t = useTranslations("staff");
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const next = String(form.get("next"));
    if (next !== String(form.get("repeat"))) {
      setOutcome("mismatch");
      return;
    }
    setPending(true);
    const result = await authClient.changePassword({
      currentPassword: String(form.get("current")),
      newPassword: next,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (result.error) {
      setOutcome(result.error.code === "INVALID_PASSWORD" ? "wrong" : "failed");
      return;
    }
    formElement.reset();
    setOutcome("saved");
  }

  const inputClass = "mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-normal";

  return (
    <form onSubmit={onSubmit} className="space-y-3 text-sm font-medium">
      <label className="block">
        {t("currentPassword")}
        <input name="current" type="password" required autoComplete="current-password" className={inputClass} />
      </label>
      <label className="block">
        {t("newPassword", { min: minLength })}
        <input name="next" type="password" required minLength={minLength} autoComplete="new-password" className={inputClass} />
      </label>
      <label className="block">
        {t("repeatPassword")}
        <input name="repeat" type="password" required minLength={minLength} autoComplete="new-password" className={inputClass} />
      </label>
      {outcome === "saved" && (
        <p role="status" className="font-normal text-emerald-800">
          {t("passwordChanged")}
        </p>
      )}
      {(outcome === "wrong" || outcome === "mismatch" || outcome === "failed") && (
        <p role="alert" className="font-normal text-red-700">
          {t(`passwordError.${outcome}`)}
        </p>
      )}
      <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-2 text-white disabled:opacity-60">
        {t("changePassword")}
      </button>
    </form>
  );
}
