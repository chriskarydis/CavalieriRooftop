/** Small flags for the language switch. Drawn here so they look the same on every device. */
export function Flag({ locale, className = "h-4 w-6" }: { locale: string; className?: string }) {
  const frame = `${className} block shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/15`;

  if (locale === "el") {
    return (
      <svg viewBox="0 0 27 18" aria-hidden className={frame}>
        <rect width="27" height="18" fill="#0d5eaf" />
        <path d="M0 3h27M0 7h27M0 11h27M0 15h27" stroke="#fff" strokeWidth="2" />
        <rect width="10" height="10" fill="#0d5eaf" />
        <path d="M5 0v10M0 5h10" stroke="#fff" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 60 40" aria-hidden className={frame}>
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0l60 40M60 0L0 40" stroke="#fff" strokeWidth="8" />
      <path d="M0 0l60 40M60 0L0 40" stroke="#c8102e" strokeWidth="3" />
      <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="13" />
      <path d="M30 0v40M0 20h60" stroke="#c8102e" strokeWidth="7" />
    </svg>
  );
}

/** The language's own name, read out by screen readers and shown as a tooltip. */
export const LANGUAGE_NAMES: Record<string, string> = { en: "English", el: "Ελληνικά" };
