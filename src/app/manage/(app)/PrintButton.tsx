"use client";

/** Opens the browser's print window for the page as it is shown. */
export function PrintButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      {label}
    </button>
  );
}
