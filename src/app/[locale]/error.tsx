"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

/** Shown when a public page fails. Says what to do next and never shows technical details. */
export default function PublicError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errorPage");

  useEffect(() => {
    // The digest links this screen to the full error in the server log.
    console.error("Page error", error.digest ?? "");
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 p-6">
      <h1 className="text-4xl">{t("title")}</h1>
      <p className="text-muted">{t("text")}</p>
      <button type="button" onClick={() => retry()} className="btn btn-primary">
        {t("retry")}
      </button>
      {error.digest && <p className="text-xs text-stone-500">{t("reference", { code: error.digest })}</p>}
    </main>
  );
}
