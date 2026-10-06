"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Brings its content into view when it appears or when `watch` changes, so a
 * guest who has just searched lands on the results rather than the page top.
 */
export function ScrollTarget({
  id,
  watch,
  children,
  className,
}: {
  id?: string;
  watch: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  }, [watch]);

  return (
    <div ref={ref} id={id} className={className}>
      {children}
    </div>
  );
}
