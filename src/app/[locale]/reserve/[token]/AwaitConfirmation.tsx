"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const POLL_MS = 2000;

/**
 * Shown after the guest returns from paying, until the server has heard from
 * the payment provider. Re-asks the server; it never decides anything itself.
 */
export function AwaitConfirmation({ message }: { message: string }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <p role="status" className="notice notice-warn">
      {message}
    </p>
  );
}
