"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

/** Shown when a management page fails, so staff are never left with a blank screen during service. */
export default function ManageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errorPage");

  useEffect(() => {
    console.error("Management page error", error.digest ?? "");
  }, [error]);

  return (
    <main className="mx-auto max-w-xl space-y-4 py-10">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="text-slate-700">{t("staffText")}</p>
      <button type="button" onClick={() => retry()} className="rounded bg-ink hover:bg-gold-deep px-3 py-2 text-sm font-medium text-white">
        {t("retry")}
      </button>
      {error.digest && <p className="text-xs text-slate-500">{t("reference", { code: error.digest })}</p>}
    </main>
  );
}
