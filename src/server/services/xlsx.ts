import { crc32, deflateRawSync } from "node:zlib";

/**
 * Writes a one-sheet Excel workbook (.xlsx) with no outside library. A real
 * workbook opens the same on every computer, whatever its regional settings;
 * a CSV file does not, because Excel guesses the column separator from them.
 *
 * Text is always stored as text, so a name typed by a guest can never run as
 * a formula. Amounts are real numbers shown with two decimals.
 */

export type SheetCell = string | number | null | { euros: number };

export interface Sheet {
  name: string;
  rows: SheetCell[][];
  /** Rows written in bold, counted from 0. */
  boldRows?: number[];
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Characters XML does not allow at all.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** 0 -> A, 25 -> Z, 26 -> AA */
function columnName(index: number): string {
  let name = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  }
  return name;
}

// Cell styles, by their position in cellXfs below.
const STYLE = { plain: 0, bold: 1, money: 2, boldMoney: 3 } as const;

function cellXml(cell: SheetCell, reference: string, bold: boolean): string {
  if (cell === null || cell === "") return "";
  if (typeof cell === "object") {
    return `<c r="${reference}" s="${bold ? STYLE.boldMoney : STYLE.money}"><v>${cell.euros.toFixed(2)}</v></c>`;
  }
  const style = bold ? ` s="${STYLE.bold}"` : "";
  if (typeof cell === "number") return `<c r="${reference}"${style}><v>${cell}</v></c>`;
  return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
}

const MIN_WIDTH = 8;
const MAX_WIDTH = 60;

function sheetXml(sheet: Sheet): string {
  const bold = new Set(sheet.boldRows ?? []);
  const widths: number[] = [];
  for (const row of sheet.rows) {
    row.forEach((cell, index) => {
      const text = cell === null ? "" : typeof cell === "object" ? cell.euros.toFixed(2) : String(cell);
      widths[index] = Math.max(widths[index] ?? MIN_WIDTH, Math.min(MAX_WIDTH, text.length + 2));
    });
  }
  const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const rows = sheet.rows
    .map((row, rowIndex) => {
      const cells = row.map((cell, index) => cellXml(cell, `${columnName(index)}${rowIndex + 1}`, bold.has(rowIndex))).join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${columns ? `<cols>${columns}</cols>` : ""}<sheetData>${rows}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// Two fonts (plain, bold) and two number formats (general, two decimals), combined into the four styles of STYLE.
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>`;

const workbookXml = (sheetName: string): string => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

// ── The zip container ───────────────────────────────────────────────────────

const DEFLATE = 8;
const UTF8_NAMES = 0x0800;
const VERSION = 20;
// 1 January 2000, midnight: a fixed date keeps the same content byte for byte.
const DOS_DATE = ((2000 - 1980) << 9) | (1 << 5) | 1;

function zip(files: Array<{ name: string; content: string }>): Buffer {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.content, "utf8");
    const packed = deflateRawSync(raw);
    const checksum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(DEFLATE, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, packed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(VERSION, 4);
    entry.writeUInt16LE(VERSION, 6);
    entry.writeUInt16LE(UTF8_NAMES, 8);
    entry.writeUInt16LE(DEFLATE, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    directory.push(entry, name);
    offset += local.length + name.length + packed.length;
  }
  const directorySize = directory.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...directory, end]);
}

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function writeXlsx(sheet: Sheet): Buffer {
  return zip([
    { name: "[Content_Types].xml", content: CONTENT_TYPES },
    { name: "_rels/.rels", content: ROOT_RELS },
    { name: "xl/workbook.xml", content: workbookXml(sheet.name) },
    { name: "xl/_rels/workbook.xml.rels", content: WORKBOOK_RELS },
    { name: "xl/styles.xml", content: STYLES },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml(sheet) },
  ]);
}
