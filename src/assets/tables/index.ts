import type { StaticImageData } from "next/image";
import photo0 from "./table-1-a.jpg";
import photo1 from "./table-11.jpg";
import photo2 from "./table-12.jpg";
import photo3 from "./table-16.jpg";
import photo4 from "./table-17.jpg";
import photo5 from "./table-19.jpg";
import photo6 from "./table-2.jpg";
import photo7 from "./table-20.jpg";
import photo8 from "./table-21.jpg";
import photo9 from "./table-22.jpg";
import photo10 from "./table-23.jpg";
import photo11 from "./table-3.jpg";
import photo12 from "./table-4.jpg";
import photo13 from "./table-5-a.jpg";
import photo14 from "./table-6.jpg";
import photo15 from "./table-23-24.jpg";

/**
 * Photographs of the view from each table, by table number. Written by
 * scripts/prepare-table-photos.mjs from the photographs in photos/;
 * do not edit by hand.
 */
export const TABLE_PHOTOS: Record<number, StaticImageData[]> = {
  1: [photo0],
  2: [photo6],
  3: [photo11],
  4: [photo12],
  5: [photo13],
  6: [photo14],
  11: [photo1],
  12: [photo2],
  16: [photo3],
  17: [photo4],
  19: [photo5],
  20: [photo7],
  21: [photo8],
  22: [photo9],
  23: [photo10, photo15],
  24: [photo15],
};
