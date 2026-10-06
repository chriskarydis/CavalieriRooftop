"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/ui/auth-client";

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded border border-white/30 px-3 py-1.5 hover:border-white hover:text-white"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/manage/login");
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
