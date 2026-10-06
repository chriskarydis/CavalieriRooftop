/** A thin gold line with a small diamond in the middle. */
export function Ornament({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`ornament ${className}`}>
      <span />
    </div>
  );
}

/** The centred title block at the top of each public page. */
export function PageHeader({ eyebrow, title, intro }: { eyebrow?: string; title: string; intro?: string }) {
  return (
    <header className="mx-auto max-w-2xl text-center">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="mt-3 text-4xl sm:text-5xl">{title}</h1>
      <Ornament className="mt-6" />
      {intro && <p className="mt-6 text-lg leading-relaxed text-muted">{intro}</p>}
    </header>
  );
}
