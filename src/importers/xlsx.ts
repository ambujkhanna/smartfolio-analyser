import { unzipSync } from "fflate";
import Papa from "papaparse";

/**
 * Minimal, dependency-light reader for .xlsx workbooks (Office Open XML).
 * It extracts cell text only — no formulas are evaluated and no macros are read —
 * so broker exports such as the Zerodha tradebook/P&L can reuse the CSV parsers.
 * Runs in the browser and in Node (tests); nothing is uploaded.
 */

export interface XlsxSheet {
  name: string;
  rows: string[][];
}

export class XlsxReadError extends Error {}

/** Guards against zip bombs: broker exports are far smaller than this. */
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (match, entity: string) => {
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "amp") return "&";
    if (entity === "quot") return '"';
    if (entity === "apos") return "'";
    const codePoint = entity.startsWith("#x") ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
  });
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? decodeEntities(match[1]) : undefined;
}

/** Concatenates every <t> run in a fragment, skipping phonetic (<rPh>) hints. */
function textRuns(fragment: string): string {
  const withoutPhonetic = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let text = "";
  for (const match of withoutPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
    text += decodeEntities(match[1]);
  }
  return text;
}

function columnIndex(cellRef: string | undefined, fallback: number): number {
  const letters = cellRef?.match(/^([A-Z]+)/)?.[1];
  if (!letters) return fallback;
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/** Shortest round-trip form, so 39.119999999999997 becomes "39.12". */
function formatNumber(raw: string): string {
  const value = Number(raw);
  return Number.isFinite(value) ? String(value) : raw;
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => textRuns(match[1]));
}

function parseSheet(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attribute(rowMatch[1], "r"));
    const cells: string[] = [];
    const body = rowMatch[2] ?? "";
    let position = 0;
    for (const cellMatch of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const index = columnIndex(attribute(tag, "r"), position);
      position = index + 1;
      const type = attribute(tag, "t");
      const rawValue = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s") value = sharedStrings[Number(rawValue)] ?? "";
      else if (type === "inlineStr") value = textRuns(inner);
      else if (type === "str" || type === "e") value = rawValue !== undefined ? decodeEntities(rawValue) : "";
      else if (type === "b") value = rawValue === "1" ? "TRUE" : rawValue === "0" ? "FALSE" : "";
      else if (rawValue !== undefined) value = formatNumber(decodeEntities(rawValue));
      cells[index] = value;
    }
    const row = Array.from({ length: cells.length }, (_, i) => cells[i] ?? "");
    const target = Number.isInteger(rowNumber) && rowNumber > 0 ? rowNumber - 1 : rows.length;
    while (rows.length < target) rows.push([]);
    rows[target] = row;
  }
  return rows;
}

function resolveTarget(target: string): string {
  const cleaned = target.replace(/^\//, "");
  return cleaned.startsWith("xl/") ? cleaned : "xl/" + cleaned;
}

export function readXlsx(bytes: Uint8Array): XlsxSheet[] {
  let totalSize = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(file.name)) return false;
        totalSize += file.originalSize;
        if (totalSize > MAX_UNCOMPRESSED_BYTES) throw new XlsxReadError("The spreadsheet is too large to read safely.");
        return true;
      },
    });
  } catch (error) {
    if (error instanceof XlsxReadError) throw error;
    throw new XlsxReadError("This file is not a valid .xlsx workbook.");
  }

  const decoder = new TextDecoder("utf-8");
  const text = (name: string) => (files[name] ? decoder.decode(files[name]) : undefined);
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new XlsxReadError("This file is not a valid .xlsx workbook.");

  const relationships = new Map<string, string>();
  for (const match of (text("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attribute(match[1], "Id");
    const target = attribute(match[1], "Target");
    if (id && target) relationships.set(id, resolveTarget(target));
  }

  const sharedStrings = parseSharedStrings(text("xl/sharedStrings.xml"));
  const sheets: XlsxSheet[] = [];
  let ordinal = 0;
  for (const match of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    ordinal += 1;
    const name = attribute(match[1], "name") ?? `Sheet${ordinal}`;
    const relationshipId = attribute(match[1], "r:id");
    const path = (relationshipId && relationships.get(relationshipId)) ?? `xl/worksheets/sheet${ordinal}.xml`;
    const xml = text(path);
    if (xml) sheets.push({ name, rows: parseSheet(xml, sharedStrings) });
  }
  return sheets;
}

const HEADER_MARKERS = new Set(["tradeid", "transactionid", "isin", "kind", "tradetype"]);

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface XlsxTable {
  sheetName: string;
  /** 1-based spreadsheet row of the header, for messages. */
  headerRowNumber: number;
  csvText: string;
}

/**
 * Finds the first sheet with a recognisable transaction header (broker exports
 * put a title block above it) and returns that table as CSV text.
 */
export function xlsxTransactionTable(bytes: Uint8Array): XlsxTable | null {
  for (const sheet of readXlsx(bytes)) {
    const headerIndex = sheet.rows.findIndex(
      (row) => row.filter((cell) => cell.trim()).length >= 3 && row.filter((cell) => HEADER_MARKERS.has(normalize(cell))).length >= 2,
    );
    if (headerIndex < 0) continue;
    const header = sheet.rows[headerIndex];
    const firstColumn = header.findIndex((cell) => cell.trim() !== "");
    const table = sheet.rows
      .slice(headerIndex)
      .map((row) => row.slice(firstColumn, firstColumn + (header.length - firstColumn)))
      .filter((row) => row.some((cell) => cell.trim() !== ""));
    return {
      sheetName: sheet.name,
      headerRowNumber: headerIndex + 1,
      csvText: Papa.unparse(table),
    };
  }
  return null;
}
