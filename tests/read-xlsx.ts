import { crc32, inflateRawSync } from "node:zlib";

/**
 * Reads back a workbook written by src/server/services/xlsx.ts, for tests:
 * unpacks the zip and returns the first sheet as rows of text.
 */

/** The files inside a zip, by name. Checks each one against its stored checksum. */
export function unzip(file: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  const end = file.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("Not a zip file");
  const count = file.readUInt16LE(end + 10);
  let position = file.readUInt32LE(end + 16);
  for (let index = 0; index < count; index++) {
    if (file.readUInt32LE(position) !== 0x02014b50) throw new Error("Broken zip directory");
    const checksum = file.readUInt32LE(position + 16);
    const packedSize = file.readUInt32LE(position + 20);
    const nameLength = file.readUInt16LE(position + 28);
    const extraLength = file.readUInt16LE(position + 30);
    const commentLength = file.readUInt16LE(position + 32);
    const localOffset = file.readUInt32LE(position + 42);
    const name = file.subarray(position + 46, position + 46 + nameLength).toString("utf8");
    const dataStart = localOffset + 30 + file.readUInt16LE(localOffset + 26) + file.readUInt16LE(localOffset + 28);
    const content = inflateRawSync(file.subarray(dataStart, dataStart + packedSize));
    if (crc32(content) !== checksum) throw new Error(`Checksum of ${name} does not match`);
    files.set(name, content.toString("utf8"));
    position += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const unescapeXml = (value: string): string =>
  value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

export interface ReadCell {
  /** Cell reference, e.g. "B2". */
  at: string;
  text: string;
  /** Stored as text (never read as a number or a formula). */
  isText: boolean;
  style: number;
}

/** The first sheet, one array of cells per row; empty cells are left out, as in the file. */
export function readSheet(file: Buffer): ReadCell[][] {
  const xml = unzip(file).get("xl/worksheets/sheet1.xml");
  if (!xml) throw new Error("No sheet in the workbook");
  return [...xml.matchAll(/<row r="\d+">([\s\S]*?)<\/row>|<row r="\d+"\/>/g)].map(([, row = ""]) =>
    [...row.matchAll(/<c r="([A-Z]+\d+)"(?: s="(\d+)")?( t="inlineStr")?>(?:<is><t[^>]*>([\s\S]*?)<\/t><\/is>|<v>([\s\S]*?)<\/v>)<\/c>/g)].map(
      ([, at, style, text, inline, value]) => ({
        at,
        text: unescapeXml(inline ?? value ?? ""),
        isText: Boolean(text),
        style: Number(style ?? 0),
      }),
    ),
  );
}

/** The sheet as plain rows of text, for a quick look at what it holds. */
export const sheetText = (file: Buffer): string[] => readSheet(file).map((row) => row.map((cell) => cell.text).join(" | "));
