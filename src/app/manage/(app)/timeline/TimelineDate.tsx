"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DateField } from "../DateField";
import { inputClass } from "../styles";

/** The timeline's date: picking or typing one shows that evening at once. */
export function TimelineDate({ date, label }: { date: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label aria-busy={pending} className="w-44">
      {label}
      <DateField
        key={date}
        name="date"
        defaultValue={date}
        required
        className={inputClass}
        onChange={(value) => {
          if (value !== date) startTransition(() => router.replace(`/manage/timeline?date=${value}`, { scroll: false }));
        }}
      />
    </label>
  );
}
