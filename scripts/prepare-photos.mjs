// Turns the owner's original photos (photos/, not committed) into web-sized files in src/assets/photos.
// Run after adding or replacing originals:  node scripts/prepare-photos.mjs
import { mkdirSync, readdirSync } from "node:fs";
import sharp from "sharp";

const SOURCE = "photos";
const TARGET = "src/assets/photos";
const MAX_SIDE = 1600;

/** Output name -> start of the original's file name. */
const PHOTOS = {
  "sunset-rooftops-wide": "0-02-05-30b277b8b4b4f665",
  "sunset-rooftops-tall": "0-02-05-f7892d4943918fc9",
  "terrace-sunset": "0-02-05-ce4f9ec6f29a8ae6",
  "fortress-day": "0-02-05-7506565d2bff70ab",
  "fortress-night": "0-02-05-cd1ddf4158b62946",
  "terrace-ship": "0-02-05-b964f221e763e3d0",
  "terrace-rainbow": "0-02-05-bf60e1c6e9483a20",
  "sunset-sun": "0-02-05-12e928d294785b9e",
  "fortress-park": "0-02-05-46edd178c4989e38",
  "palace-view": "0-02-05-49e6db6d39c27475",
  "dusk-pink": "0-02-05-6cf5d3ddd094dfc8",
  "dusk-clouds": "0-02-05-73df19e71b894de6",
  "dusk-lights": "0-02-05-b208e418ec45a1c9",
  "sun-rays": "0-02-05-be13a42a8bc05091",
  "golden-rooftops": "0-02-05-cc8b053e3a8c0637",
  "blue-hour": "0-02-05-e11e55c9f8367f42",
  "pasta-view": "images (1).jpg",
  // October 2026, daylight, from photos/converted (JPG copies of the owner's HEIC originals).
  "fortress-table-ship": "converted/IMG_8620",
  "terrace-fortress": "converted/IMG_8591",
  "terrace-panorama": "converted/IMG_8608",
  "terrace-entrance": "converted/IMG_8595",
  "terrace-fortress-wide": "converted/IMG_8590",
  "terrace-tables": "converted/IMG_8589",
  "fortress-tables-rail": "converted/IMG_8604",
  "fortress-table-tall": "converted/IMG_8606",
  "old-town-tables": "converted/IMG_8601",
  "old-town-roofs": "converted/IMG_8609",
  "fortress-trees": "converted/IMG_8611",
  "ship-table": "converted/IMG_8634",
  "garitsa-tables": "converted/IMG_8629",
  "terrace-long": "converted/IMG_8628",
  "fortress-close": "converted/IMG_8593",
  "fortress-table-wide": "converted/IMG_8619",
};

/** Wider than the rest: shown as a strip across the page. */
const WIDE = { "terrace-panorama": 3200 };

/** The logo with a transparent background, as supplied by the owner. */
const LOGO = "roofgardenlogo-removebg-preview.png";

mkdirSync(TARGET, { recursive: true });
const originals = [...readdirSync(SOURCE), ...readdirSync(`${SOURCE}/converted`).map((file) => `converted/${file}`)];

for (const [name, prefix] of Object.entries(PHOTOS)) {
  const original = originals.find((file) => file.startsWith(prefix));
  if (!original) throw new Error(`No original starting with "${prefix}" in ${SOURCE}/`);
  const image = sharp(`${SOURCE}/${original}`).rotate();
  await image
    .resize({ width: WIDE[name] ?? MAX_SIDE, height: WIDE[name] ?? MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(`${TARGET}/${name}.jpg`);
  console.log(`${name} <- ${original.slice(0, 28)}`);
}

// Logo for light backgrounds: the supplied file as it is. The knight is cut out of the gold badge, so
// on white it reads as a white knight.
await sharp(`${SOURCE}/${LOGO}`).png({ compressionLevel: 9 }).toFile(`${TARGET}/logo.png`);
await sharp(`${SOURCE}/${LOGO}`).png({ compressionLevel: 9 }).toFile("public/logo.png");

// Logo for dark backgrounds: the same, with white laid behind the badge so the knight stays white.
{
  const { data, info } = await sharp(`${SOURCE}/${LOGO}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const solid = (x, y) => data[(y * info.width + x) * 4 + 3] > 200;
  // A column belongs to the badge when most of it is opaque; lettering columns never are.
  const columns = [];
  for (let x = 0; x < info.width * 0.35; x++) {
    let count = 0;
    for (let y = 0; y < info.height; y++) if (solid(x, y)) count++;
    if (count > info.height * 0.45) columns.push(x);
  }
  const left = columns[0];
  const right = columns[columns.length - 1];
  const rows = [];
  for (let y = 0; y < info.height; y++) {
    let count = 0;
    for (let x = left; x <= right; x++) if (solid(x, y)) count++;
    if (count > (right - left) * 0.45) rows.push(y);
  }
  const top = rows[0];
  // The badge ends in a point; the white must stop where its sides stop being straight.
  let straight = rows[rows.length - 1];
  for (let y = straight; y > top; y--) {
    if (solid(left + 2, y) && solid(right - 2, y)) {
      straight = y;
      break;
    }
  }
  const inset = 5;
  const backing = Buffer.from(
    `<svg width="${info.width}" height="${info.height}"><rect x="${left + inset}" y="${top + inset}" width="${right - left - 2 * inset}" height="${straight - top - 2 * inset}" rx="6" fill="#fff"/></svg>`,
  );
  await sharp(backing)
    .composite([{ input: `${SOURCE}/${LOGO}` }])
    .png({ compressionLevel: 9 })
    .toFile(`${TARGET}/logo-on-dark.png`);
  console.log("logo, logo-on-dark <- " + LOGO);
}
