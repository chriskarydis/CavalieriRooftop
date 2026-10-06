"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "crg_chime";

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

/**
 * Plays a sound on the live floor when a new reservation comes in. `latestId`
 * is the newest "new reservation" notification; the sound plays when it
 * changes while the page is open, never on first load. Browsers only allow
 * sound after the page has been clicked once, which staff will have done.
 */
export function NewReservationChime({ latestId, labels }: { latestId: string; labels: { on: string; off: string; test: string } }) {
  const [enabled, setEnabled] = useState(true);
  const seen = useRef<string | null>(null);

  useEffect(() => {
    const read = () => setEnabled(window.localStorage.getItem(STORAGE_KEY) !== "off");
    read();
  }, []);

  useEffect(() => {
    const isNew = seen.current !== null && latestId !== "" && latestId !== seen.current;
    seen.current = latestId;
    if (isNew && enabled) chime();
  }, [latestId, enabled]);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    if (next) chime();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      title={labels.test}
      className="rounded border border-stone-300 bg-white px-2.5 py-1 text-sm hover:border-ink print:hidden"
    >
      <span aria-hidden className="mr-1.5">
        {enabled ? "🔔" : "🔕"}
      </span>
      {enabled ? labels.on : labels.off}
    </button>
  );
}
