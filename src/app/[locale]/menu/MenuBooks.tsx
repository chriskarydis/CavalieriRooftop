"use client";

import { useRef, useState } from "react";

export interface BookItem {
  id: string;
  name: string;
  description: string;
  notes: string;
  price: string | null;
  imageUrl: string | null;
  /** Small labels under the dish: "Vegetarian", "Not available today" and so on. */
  tags: Array<{ label: string; tone: "gold" | "green" | "muted" }>;
  allergens: string;
  available: boolean;
}

export interface Book {
  key: string;
  title: string;
  text: string;
  sections: Array<{ id: string; name: string; items: BookItem[] }>;
}

const TONE = { gold: "text-gold-deep", green: "text-emerald-800", muted: "text-muted" } as const;

/**
 * The restaurant's lists as three covers. Each opens like a menu on the table,
 * in a window over the page. Everything is in the page from the start, so it
 * can be searched and read by search engines; the window only shows it.
 */
export function MenuBooks({
  books,
  labels,
}: {
  books: Book[];
  labels: { open: string; close: string; sections: string; footnote: string };
}) {
  const dialogs = useRef(new Map<string, HTMLDialogElement>());
  const pages = useRef(new Map<string, HTMLDivElement>());
  const strips = useRef(new Map<string, HTMLElement>());
  /** The section being read in each list. */
  const [current, setCurrent] = useState<Record<string, string>>({});

  /** Brings a section's name into view in the strip of names, without moving anything else. */
  const reveal = (bookKey: string, sectionId: string) => {
    const strip = strips.current.get(bookKey);
    const tab = strip?.querySelector<HTMLElement>(`[data-section="${CSS.escape(sectionId)}"]`);
    if (!strip || !tab) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollTo({ left: tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2, behavior: calm ? "auto" : "smooth" });
  };

  const mark = (bookKey: string, sectionId: string) => {
    setCurrent((previous) => (previous[bookKey] === sectionId ? previous : { ...previous, [bookKey]: sectionId }));
    reveal(bookKey, sectionId);
  };

  /** While the list is scrolled: the section whose heading has reached the top is the one being read. */
  const onScroll = (bookKey: string, page: HTMLDivElement) => {
    const top = page.getBoundingClientRect().top + 90;
    const atEnd = page.scrollTop + page.clientHeight >= page.scrollHeight - 4;
    const sections = [...page.querySelectorAll<HTMLElement>("section[id]")];
    const reading = atEnd ? sections.at(-1) : (sections.filter((section) => section.getBoundingClientRect().top <= top).at(-1) ?? sections[0]);
    if (reading && current[bookKey] !== reading.id) mark(bookKey, reading.id);
  };

  const jump = (bookKey: string, sectionId: string) => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const page = pages.current.get(bookKey);
    const section = page?.querySelector<HTMLElement>(`#${CSS.escape(sectionId)}`);
    if (!page || !section) return;
    mark(bookKey, sectionId);
    page.scrollTo({ top: section.offsetTop - page.offsetTop, behavior: calm ? "auto" : "smooth" });
  };

  return (
    <>
      <ul className="mt-12 grid gap-6 md:grid-cols-3">
        {books.map((book) => (
          <li key={book.key}>
            <button
              type="button"
              onClick={() => dialogs.current.get(book.key)?.showModal()}
              className="group flex h-full min-h-72 w-full flex-col items-center justify-center border border-gold bg-paper p-2 text-center transition-shadow hover:shadow-lg"
            >
              {/* The inner line makes the double border of a printed menu cover. */}
              <span className="flex size-full flex-col items-center justify-center border border-gold/50 px-6 py-10">
                <span className="font-display text-3xl">{book.title}</span>
                <span aria-hidden className="ornament mt-5">
                  <span />
                </span>
                <span className="mt-5 text-sm leading-relaxed text-muted">{book.text}</span>
                <span className="mt-7 border-b border-gold pb-1 text-xs font-medium tracking-[0.2em] uppercase group-hover:text-gold-deep">
                  {labels.open}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {books.map((book) => (
        <dialog
          key={book.key}
          ref={(node) => {
            if (node) dialogs.current.set(book.key, node);
            else dialogs.current.delete(book.key);
          }}
          aria-labelledby={`book-${book.key}`}
          // A click on the dimmed page around the window closes it.
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close();
          }}
          className="m-auto h-[92vh] w-[min(46rem,calc(100vw-1.5rem))] max-w-none overflow-hidden border border-gold bg-paper p-0 text-ink backdrop:bg-night/70"
        >
          <div className="flex h-full flex-col">
            <header className="border-b border-line px-5 pt-5 sm:px-8">
              <div className="flex items-start justify-between gap-4">
                <h2 id={`book-${book.key}`} className="text-3xl sm:text-4xl">
                  {book.title}
                </h2>
                <button
                  type="button"
                  aria-label={labels.close}
                  title={labels.close}
                  onClick={() => dialogs.current.get(book.key)?.close()}
                  className="flex size-10 shrink-0 items-center justify-center border border-line text-xl hover:border-ink"
                >
                  <span aria-hidden>×</span>
                </button>
              </div>
              <nav
                aria-label={labels.sections}
                ref={(node) => {
                  if (node) strips.current.set(book.key, node);
                  else strips.current.delete(book.key);
                }}
                className="relative -mx-5 mt-3 overflow-x-auto px-5 sm:-mx-8 sm:px-8"
              >
                <ul className="flex gap-6 text-[0.7rem] font-medium tracking-[0.16em] whitespace-nowrap uppercase">
                  {book.sections.map((section) => (
                    <li key={section.id} data-section={section.id}>
                      <button
                        type="button"
                        aria-current={(current[book.key] ?? book.sections[0]?.id) === section.id ? "true" : undefined}
                        onClick={() => jump(book.key, section.id)}
                        className="border-b-2 border-transparent py-3 uppercase hover:text-gold-deep aria-[current]:border-ink"
                      >
                        {section.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            </header>

            <div
              ref={(node) => {
                if (node) pages.current.set(book.key, node);
                else pages.current.delete(book.key);
              }}
              onScroll={(event) => onScroll(book.key, event.currentTarget)}
              className="relative flex-1 overflow-y-auto overscroll-contain px-5 pb-10 sm:px-8"
            >
              {book.sections.map((section) => (
                <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="pt-10">
                  <h3 id={`${section.id}-title`} className="text-center text-3xl">
                    {section.name}
                  </h3>
                  <div aria-hidden className="ornament mt-3 mb-3">
                    <span />
                  </div>
                  <ul className="divide-y divide-line">
                    {section.items.map((item) => (
                      <li key={item.id} className={`flex gap-5 py-4 ${item.available ? "" : "opacity-60"}`}>
                        {item.imageUrl && (
                          // Manager-supplied address on any host, so the Next image optimiser cannot be used.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt="" loading="lazy" className="size-24 shrink-0 object-cover" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-3">
                            <h4 className="font-display text-xl sm:text-2xl">{item.name}</h4>
                            {item.price && (
                              <>
                                {/* A dotted leader between the dish and its price, as on a printed menu. */}
                                <span aria-hidden className="min-w-6 flex-1 -translate-y-1 border-b border-dotted border-gold" />
                                <span className="shrink-0 font-display text-xl tabular-nums">{item.price}</span>
                              </>
                            )}
                          </div>
                          {item.description && <p className="mt-1 text-muted">{item.description}</p>}
                          {item.notes && <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.notes}</p>}
                          {item.tags.length > 0 && (
                            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] font-medium tracking-[0.16em] uppercase">
                              {item.tags.map((tag) => (
                                <li key={tag.label} className={TONE[tag.tone]}>
                                  {tag.label}
                                </li>
                              ))}
                            </ul>
                          )}
                          {item.allergens && <p className="mt-1.5 text-xs text-muted">{item.allergens}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <p className="mt-10 border-t border-line pt-5 text-center text-sm text-muted">{labels.footnote}</p>
            </div>
          </div>
        </dialog>
      ))}
    </>
  );
}
