// Builds the site's icons from the owner's knight artwork (photos/android-chrome-512x512.png):
// the white knight alone, enlarged to fill a gold square, with no white frame around it.
// Run:  node scripts/prepare-icons.mjs
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const SOURCE = "photos/android-chrome-512x512.png";
const GOLD = "#a8843f";
const CANVAS = 512;
/** Space left around the knight, as a share of the icon's side. */
const PADDING = 0.07;

// 1. Pull the white knight out of the artwork, ignoring the white page corners around the badge.
const { data, info } = await sharp(SOURCE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const mask = Buffer.alloc(info.width * info.height);
let left = info.width;
let right = 0;
let top = info.height;
let bottom = 0;
for (let y = 12; y < info.height - 60; y++) {
  for (let x = 30; x < info.width - 30; x++) {
    const i = (y * info.width + x) * 3;
    if (data[i] > 215 && data[i + 1] > 215 && data[i + 2] > 205) {
      mask[y * info.width + x] = 255;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
}
const knight = await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } })
  .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
  .png()
  .toBuffer();

// 2. Lay it, slightly thickened so thin lines survive at small sizes, on a gold square.
async function icon(cornerRadius) {
  const pad = Math.round(CANVAS * PADDING);
  const box = CANVAS - 2 * pad;
  let shape = await sharp(knight).resize({ width: box, height: box, fit: "contain", background: "#000" }).png().toBuffer();
  shape = await sharp(shape).blur(1.6).png().toBuffer();
  shape = await sharp(shape).threshold(70).png().toBuffer();
  shape = await sharp(shape).blur(0.6).png().toBuffer();
  const alpha = await sharp(shape).extractChannel(0).toBuffer();
  const white = await sharp({ create: { width: box, height: box, channels: 3, background: "#fff" } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  const background = Buffer.from(
    `<svg width="${CANVAS}" height="${CANVAS}"><rect width="${CANVAS}" height="${CANVAS}" rx="${cornerRadius}" fill="${GOLD}"/></svg>`,
  );
  return sharp(background).composite([{ input: white, left: pad, top: pad }]).png().toBuffer();
}

const rounded = await icon(96);
// Phones round the corners themselves and show black where an icon is transparent, so this one is square.
const square = await icon(0);

await sharp(rounded).png({ compressionLevel: 9 }).toFile("src/app/icon.png");
await sharp(square).resize(180, 180).png({ compressionLevel: 9 }).toFile("src/app/apple-icon.png");

// 3. favicon.ico for browsers that ask for it by name: an ICO container holding 16, 32 and 48 pixel PNGs.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((size) => sharp(rounded).resize(size, size, { kernel: "lanczos3" }).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, index) => {
  const entry = 6 + 16 * index;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...images]));
console.log("icon.png, apple-icon.png, favicon.ico written");
