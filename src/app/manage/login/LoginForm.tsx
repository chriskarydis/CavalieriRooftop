"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/ui/auth-client";

const TOO_MANY_REQUESTS = 429;

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    // Goes through /api/auth so the sign-in rate limit applies.
    const result = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setPending(false);
    if (result.error) {
      setError(
        result.error.status === TOO_MANY_REQUESTS
          ? "Too many attempts. Please wait a minute and try again."
          : "The email or password is incorrect.",
      );
      return;
    }
    router.replace("/manage");
    router.refresh();
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-slate-900";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm font-medium">
        Email
        <input name="email" type="email" autoComplete="username" required className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
