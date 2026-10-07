"use client";

import { useTranslations } from "next-intl";
import Image, { type StaticImageData } from "next/image";
import { useRef, useState } from "react";

export interface ZoomPhoto {
  image: StaticImageData;
  alt: string;
}

/**
 * The window a photograph opens in when it is clicked: the picture as large as
 * the screen allows, on a dark ground. With several photographs it also steps
 * to the previous and the next. Closes with its button, the Esc key, or a click
 * on the dark ground.
 */
function Viewer({
  photos,
  index,
  onIndex,
  dialogRef,
}: {
  photos: readonly ZoomPhoto[];
  index: number;
  onIndex: (index: number) => void;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
}) {
  const t = useTranslations("site");
  const photo = photos[index];
  const many = photos.length > 1;
  const step = (by: number) => onIndex((index + by + photos.length) % photos.length);
  const control = "flex size-11 items-center justify-center border border-white/50 bg-black/40 text-2xl text-white hover:bg-white hover:text-ink";

  return (
    <dialog
      ref={dialogRef}
      aria-label={photo?.alt}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      onKeyDown={(event) => {
        if (!many) return;
        if (event.key === "ArrowLeft") step(-1);
        if (event.key === "ArrowRight") step(1);
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-night/95 p-0 backdrop:bg-night"
    >
      {photo && (
        // A click anywhere outside the picture and the buttons closes the window.
        <div
          className="flex size-full items-center justify-center p-3 sm:p-10"
          onClick={(event) => {
            if (event.target === event.currentTarget) dialogRef.current?.close();
          }}
        >
          <Image
            key={photo.image.src}
            src={photo.image}
            alt={photo.alt}
            sizes="100vw"
            placeholder="blur"
            className="max-h-full w-auto max-w-full object-contain"
          />
          <button type="button" aria-label={t("closePhoto")} title={t("closePhoto")} onClick={() => dialogRef.current?.close()} className={`${control} absolute top-3 right-3`}>
            <span aria-hidden>×</span>
          </button>
          {many && (
            <>
              <button type="button" aria-label={t("previousPhoto")} title={t("previousPhoto")} onClick={() => step(-1)} className={`${control} absolute top-1/2 left-3 -translate-y-1/2`}>
                <span aria-hidden>‹</span>
              </button>
              <button type="button" aria-label={t("nextPhoto")} title={t("nextPhoto")} onClick={() => step(1)} className={`${control} absolute top-1/2 right-3 -translate-y-1/2`}>
                <span aria-hidden>›</span>
              </button>
              <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs tracking-[0.2em] text-white/80 tabular-nums">
                {index + 1} / {photos.length}
              </p>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}

/** One photograph that opens larger when clicked. Takes the place of a plain image. */
export function ZoomImage({
  image,
  alt,
  sizes,
  className,
  priority,
  buttonClassName = "",
}: ZoomPhoto & { sizes: string; className?: string; priority?: boolean; buttonClassName?: string }) {
  const t = useTranslations("site");
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" aria-label={t("enlargePhoto", { photo: alt })} onClick={() => dialog.current?.showModal()} className={`block w-full cursor-zoom-in ${buttonClassName}`}>
        <Image src={image} alt={alt} placeholder="blur" sizes={sizes} priority={priority} className={className} />
      </button>
      <Viewer photos={[{ image, alt }]} index={0} onIndex={() => {}} dialogRef={dialog} />
    </>
  );
}

/** A set of photographs laid out in columns; each opens larger, and the window steps through them all. */
export function ZoomGallery({ photos, className, itemClassName }: { photos: readonly ZoomPhoto[]; className?: string; itemClassName?: string }) {
  const t = useTranslations("site");
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  return (
    <>
      <ul className={className}>
        {photos.map((photo, position) => (
          <li key={photo.image.src} className={itemClassName}>
            <button
              type="button"
              aria-label={t("enlargePhoto", { photo: photo.alt })}
              onClick={() => {
                setIndex(position);
                dialog.current?.showModal();
              }}
              className="block w-full cursor-zoom-in"
            >
              <Image
                src={photo.image}
                alt={photo.alt}
                placeholder="blur"
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                priority={position < 2}
                className="h-auto w-full"
              />
            </button>
          </li>
        ))}
      </ul>
      <Viewer photos={photos} index={index} onIndex={setIndex} dialogRef={dialog} />
    </>
  );
}
