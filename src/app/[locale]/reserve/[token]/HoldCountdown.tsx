"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";

const SECOND_MS = 1000;
const WARNING_SECONDS = 120;

/**
 * Shows how long the table is still held. When the time runs out the guest is
 * sent back to table selection, where the floor plan is loaded fresh.
 */
export function HoldCountdown({
  expiresAt,
  restartHref,
}: {
  expiresAt: string;
  restartHref: { pathname: "/reserve"; query: Record<string, string> };
}) {
  const t = useTranslations("checkout");
  const router = useRouter();
  const deadline = new Date(expiresAt).getTime();
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / SECOND_MS)));
    tick();
    const timer = setInterval(tick, SECOND_MS);
    return () => clearInterval(timer);
  }, [deadline]);

  useEffect(() => {
    if (remaining === 0) {
      router.replace({ ...restartHref, query: { ...restartHref.query, error: "HOLD_EXPIRED" } });
    }
  }, [remaining, restartHref, router]);

  if (remaining === null) return <p className="h-12" />;
  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");

  return (
    <p
      role="timer"
      className={`rounded-md p-3 text-sm font-medium ${
        remaining <= WARNING_SECONDS ? "bg-red-50 text-red-900" : "bg-orange-50 text-orange-900"
      }`}
    >
      {t("countdown", { time: `${minutes}:${seconds}` })}
    </p>
  );
}
