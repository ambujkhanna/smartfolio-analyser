import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseZerodhaTradebook } from "./zerodhaTradebook";
import { readXlsx, xlsxTransactionTable, XlsxReadError } from "./xlsx";

/** Builds a tiny synthetic workbook shaped like a Zerodha export (no real data). */
function workbook(sheetXml: string, sharedStrings: string[]): Uint8Array {
  const sst = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sharedStrings
    .map((value) => `<si><t>${value}</t></si>`)
    .join("")}</sst>`;
  return zipSync({
    "xl/workbook.xml": strToU8(
      `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Equity" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/sharedStrings.xml": strToU8(sst),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${sheetXml}</sheetData></worksheet>`),
  });
}

const headers = ["Symbol", "ISIN", "Trade Date", "Exchange", "Segment", "Series", "Trade Type", "Auction", "Quantity", "Price", "Trade ID", "Order ID", "Order Execution Time"];
const strings = [...headers, "Tradebook for Equity from 2026-10-11 to 2026-11-11", "TESTCO", "INE000A01011", "2026-10-12", "NSE", "EQ", "buy", "2026-10-12T11:10:06", "R&amp;D Ltd"];
const s = (value: string) => strings.indexOf(value);
const cols = "ABCDEFGHIJKLM";

function headerRow(rowNumber: number): string {
  return `<row r="${rowNumber}">${headers.map((h, i) => `<c r="${cols[i]}${rowNumber}" t="s"><v>${s(h)}</v></c>`).join("")}</row>`;
}

function tradeRow(rowNumber: number, price: string, tradeId: string): string {
  const shared = (col: string, value: string) => `<c r="${col}${rowNumber}" t="s"><v>${s(value)}</v></c>`;
  const number = (col: string, value: string) => `<c r="${col}${rowNumber}"><v>${value}</v></c>`;
  return `<row r="${rowNumber}">${shared("A", "TESTCO")}${shared("B", "INE000A01011")}${shared("C", "2026-10-12")}${shared("D", "NSE")}${shared("E", "EQ")}${shared("F", "EQ")}${shared("G", "buy")}${number("H", "0")}${number("I", "100")}${number("J", price)}${number("K", tradeId)}${number("L", "1300000038837679")}${shared("M", "2026-10-12T11:10:06")}</row>`;
}

describe("xlsx reader", () => {
  it("finds the tradebook table below the title block and cleans float noise", () => {
    const bytes = workbook(
      `<row r="11"><c r="A11" t="s"><v>${s("Tradebook for Equity from 2026-10-11 to 2026-11-11")}</v></c></row>` +
        headerRow(15) +
        tradeRow(16, "39.119999999999997", "604008084"),
      strings,
    );
    const table = xlsxTransactionTable(bytes);
    expect(table?.sheetName).toBe("Equity");
    expect(table?.headerRowNumber).toBe(15);
    expect(table?.csvText.split(/\r?\n/)[1]).toContain(",39.12,604008084,");
  });

  it("feeds the Zerodha tradebook parser with execution timestamps", () => {
    const table = xlsxTransactionTable(workbook(headerRow(1) + tradeRow(2, "39.12", "604008084"), strings));
    const result = parseZerodhaTradebook(table?.csvText ?? "", "tradebook.xlsx");
    expect(result?.acceptedCount).toBe(1);
    expect(result?.transactions[0]).toMatchObject({
      kind: "buy",
      quantity: 100,
      unitPrice: 39.12,
      currency: "INR",
      occurredAt: "2026-10-12T11:10:06+05:30",
      transactionId: "NSE:2026-10-12:604008084",
    });
  });

  it("decodes XML entities in shared strings", () => {
    const sheets = readXlsx(workbook(`<row r="1"><c r="A1" t="s"><v>${s("R&amp;D Ltd")}</v></c></row>`, strings));
    expect(sheets[0].rows[0][0]).toBe("R&D Ltd");
  });

  it("returns null when no transaction table is present", () => {
    expect(xlsxTransactionTable(workbook(`<row r="1"><c r="A1"><v>1</v></c></row>`, strings))).toBeNull();
  });

  it("rejects files that are not workbooks", () => {
    expect(() => readXlsx(strToU8("symbol,isin\nA,B"))).toThrow(XlsxReadError);
  });
});
