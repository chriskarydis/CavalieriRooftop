"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "crg_chime";
/** How often the page asks whether anything new has come in. */
const POLL_MS = 20_000;

/** Two short rising notes. Made here so no sound file has to be loaded. */
function chime(): void {
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  [660, 880].forEach((frequency, index) => {
    const start = context.currentTime + index * 0.18;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.4);
  });
  setTimeout(() => void context.close(), 1200);
}

interface Summary {
  count: number;
  /** The newest unread "new reservation" notification, or "". */
  latestId: string;
}

/**
 * The bell in the management header, on every page: how many notifications are
 * unread, and a sound when a new reservation comes in while the page is open
 * (never on first load). Browsers only allow sound after the page has been
 * clicked once, which staff will have done.
 */
export function NotificationBell({
  initial,
  labels,
}: {
  initial: Summary;
  labels: { unread: string; none: string; soundOn: string; soundOff: string; hint: string };
}) {
  const pathname = usePathname();
  const [summary, setSummary] = useState(initial);
  const [enabled, setEnabled] = useState(true);
  const seen = useRef(initial.latestId);

  const check = useCallback(async () => {
    try {
      const response = await fetch("/manage/notifications", { cache: "no-store" });
      if (!response.ok) return;
      setSummary((await response.json()) as Summary);
    } catch {
      // Offline for a moment: the next check will catch up.
    }
  }, []);

  useEffect(() => {
    const read = () => setEnabled(window.localStorage.getItem(STORAGE_KEY) !== "off");
    read();
  }, []);

  // Asked again on every page change, when the window is looked at again, and on a timer.
  useEffect(() => {
    const first = window.setTimeout(() => void check(), 0);
    const timer = window.setInterval(() => void check(), POLL_MS);
    window.addEventListener("focus", check);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [check, pathname]);

  useEffect(() => {
    const isNew = summary.latestId !== "" && summary.latestId !== seen.current;
    seen.current = summary.latestId;
    if (isNew && enabled) chime();
  }, [summary.latestId, enabled]);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    if (next) chime();
  };

  const label = summary.count > 0 ? labels.unread.replace("{count}", String(summary.count)) : labels.none;
  return (
    <span className="flex items-center gap-1">
      <Link
        href="/manage#notifications-heading"
        aria-label={label}
        title={label}
        className={`relative flex size-9 items-center justify-center rounded-full hover:bg-white/10 ${summary.count > 0 ? "text-gold" : "text-stone-400 hover:text-white"}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
          <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
        </svg>
        {summary.count > 0 && (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-gold px-1 text-[0.68rem] font-semibold text-night tabular-nums">
            {summary.count > 99 ? "99+" : summary.count}
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={enabled}
        aria-label={enabled ? labels.soundOn : labels.soundOff}
        title={`${enabled ? labels.soundOn : labels.soundOff}. ${labels.hint}`}
        className={`flex size-9 items-center justify-center rounded-full hover:bg-white/10 ${enabled ? "text-stone-300 hover:text-white" : "text-stone-500 hover:text-white"}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z" />
          {enabled ? <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" /> : <path d="m16 9.5 5 5m0-5-5 5" />}
        </svg>
      </button>
    </span>
  );
}
