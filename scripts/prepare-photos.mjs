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
  logo: "roofgardenlogo.jpg",
};

mkdirSync(TARGET, { recursive: true });
const originals = readdirSync(SOURCE);

for (const [name, prefix] of Object.entries(PHOTOS)) {
  const original = originals.find((file) => file.startsWith(prefix));
  if (!original) throw new Error(`No original starting with "${prefix}" in ${SOURCE}/`);
  const image = sharp(`${SOURCE}/${original}`).rotate();
  if (name === "logo") {
    // Trimmed of its white margin; shown on white, so it stays a JPEG-sized PNG without transparency.
    await image.trim().resize({ width: 640 }).png({ compressionLevel: 9 }).toFile(`${TARGET}/${name}.png`);
  } else {
    await image
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(`${TARGET}/${name}.jpg`);
  }
  console.log(`${name} <- ${original.slice(0, 28)}`);
}
