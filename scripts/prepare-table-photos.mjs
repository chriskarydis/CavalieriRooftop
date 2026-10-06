// Turns photographs in photos/ (not committed) into the "view from this table" pictures of the
// booking page. Name each photograph after its table: "table_12.jpg" (or just "12.jpg"),
// "table_23_24.jpg" when tables share a view, and "table_1_a.jpg", "table_1_b.jpg" for several
// photographs of one table. JPG, PNG and HEIC (iPhone) are accepted, in any folder under photos/.
// Run after adding or renaming photographs:  node scripts/prepare-table-photos.mjs
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import convert from "heic-convert";
import sharp from "sharp";

const SOURCE = "photos";
const TARGET = "src/assets/tables";
const MAX_SIDE = 1400;
/** "table_12", "12", "table_23_24", "table_1_a": table numbers, then perhaps a letter to tell photographs apart. */
const NAME = /^\s*(table[\s_-]*)?\d+([\s_,-]+(\d+|[a-z]))*\s*$/i;
const numbersIn = (base) => base.match(/\d+/g).map(Number);
/** Photographs the owner does not want shown (file names without extension). The originals stay where they are. */
const LEFT_OUT = new Set(["table_1_b", "table_5_b"]);

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const found = walk(SOURCE)
  .map((path) => {
    const file = path.split(/[\\/]/).pop();
    const dot = file.lastIndexOf(".");
    return { path, base: file.slice(0, dot), extension: file.slice(dot + 1).toLowerCase() };
  })
  .filter(({ base, extension }) => !LEFT_OUT.has(base.toLowerCase()) && NAME.test(base) && ["jpg", "jpeg", "png", "heic"].includes(extension))
  // A table's own photographs come before ones it shares with other tables.
  .sort((a, b) => numbersIn(a.base).length - numbersIn(b.base).length || a.base.localeCompare(b.base));

rmSync(TARGET, { recursive: true, force: true });
mkdirSync(TARGET, { recursive: true });

const entries = [];
const tables = new Set();
const written = new Set();
for (const { path, base, extension } of found) {
  const numbers = numbersIn(base);
  const variant = base.match(/[\s_,-]([a-z])\s*$/i)?.[1].toLowerCase();
  const output = `table-${numbers.join("-")}${variant ? `-${variant}` : ""}.jpg`;
  if (written.has(output)) {
    console.warn(`Skipped ${path}: another file already gives ${output}`);
    continue;
  }
  const original = readFileSync(path);
  const input = extension === "heic" ? Buffer.from(await convert({ buffer: original, format: "JPEG", quality: 0.95 })) : original;
  await sharp(input)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(join(TARGET, output));
  written.add(output);
  numbers.forEach((number) => tables.add(number));
  entries.push({ numbers, output });
  console.log(`${path} -> ${output}`);
}

const rows = [...tables]
  .sort((a, b) => a - b)
  .map((number) => {
    const photos = entries.flatMap(({ numbers }, index) => (numbers.includes(number) ? [`photo${index}`] : []));
    return `  ${number}: [${photos.join(", ")}],\n`;
  });
const lines = [
  `import type { StaticImageData } from "next/image";`,
  ...entries.map(({ output }, index) => `import photo${index} from "./${output}";`),
  ``,
  `/**`,
  ` * Photographs of the view from each table, by table number. Written by`,
  ` * scripts/prepare-table-photos.mjs from the photographs in photos/;`,
  ` * do not edit by hand.`,
  ` */`,
  `export const TABLE_PHOTOS: Record<number, StaticImageData[]> = {${rows.length === 0 ? "" : "\n"}${rows.join("")}};`,
  ``,
];
writeFileSync(join(TARGET, "index.ts"), lines.join("\n"));
console.log(`${entries.length} photographs for ${tables.size} tables.`);
