"use client";

import { useState } from "react";

/**
 * The map on the contact page. It comes from Google and may set Google's own
 * cookies, so it is loaded only when the visitor asks for it. Until then the
 * page stays free of third-party content.
 */
export function LocationMap({ src, title, showLabel, note }: { src: string; title: string; showLabel: string; note: string }) {
  const [shown, setShown] = useState(false);

  if (shown) {
    return (
      <iframe
        src={src}
        title={title}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        className="h-[26rem] w-full border border-line"
      />
    );
  }
  return (
    <div className="flex h-[26rem] w-full flex-col items-center justify-center gap-4 border border-line bg-paper px-6 text-center">
      <svg viewBox="0 0 24 24" aria-hidden className="size-10 text-gold" fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.800 12 21 12 21Z" />
        <circle cx="12" cy="9.500" r="2.5" />
      </svg>
      <button type="button" onClick={() => setShown(true)} className="btn btn-outline">
        {showLabel}
      </button>
      <p className="max-w-sm text-xs text-muted">{note}</p>
    </div>
  );
}
