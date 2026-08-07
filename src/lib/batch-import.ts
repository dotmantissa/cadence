import Papa from "papaparse";
import * as XLSX from "xlsx";

/**
 * Batch import: turn a payer-supplied CSV, JSON, or spreadsheet into recipient
 * rows we can trust. This is a strict trust boundary. A file that does not match
 * the documented shape is REJECTED with a specific reason rather than
 * best-guessed, so a payer never silently streams to the wrong list.
 *
 * The accepted shape (see /batch-guide):
 *   - A `recipient` column: a 0x wallet address or a @handle (one per row).
 *   - An optional `amount` column: USDC per recipient. May be omitted entirely,
 *     in which case the payer sets amounts in the app.
 * Column headers are case-insensitive and a few aliases are accepted. Amount may
 * be blank on some rows and filled on others; blanks come back as "".
 */

export interface ImportedRow {
  recipient: string;
  /** Display string, "" when the file left it blank/absent. */
  amount: string;
}

export type ImportResult =
  | { ok: true; rows: ImportedRow[]; hadAmountColumn: boolean }
  | { ok: false; error: string };

/** Hard ceiling so a giant file can't lock up the tab or the batch flow. */
const MAX_ROWS = 200;

const RECIPIENT_KEYS = ["recipient", "address", "wallet", "walletaddress", "username", "handle", "to"];
const AMOUNT_KEYS = ["amount", "usdc", "value", "total"];

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
// A permissive handle gate for import only; the resolver does the real check.
const HANDLE_RE = /^@?[a-zA-Z0-9_]{3,20}$/;

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** A recipient cell must at least look like an address or a handle. */
function looksLikeRecipient(v: string): boolean {
  const t = v.trim();
  return ADDRESS_RE.test(t) || HANDLE_RE.test(t);
}

/** Validate a decimal USDC amount string. Returns cleaned value or null. */
function cleanAmount(raw: unknown): string | null {
  if (raw === null || raw === undefined) return "";
  const s = String(raw).trim().replace(/[$,]/g, "");
  if (s === "") return "";
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!isFinite(n) || n < 0) return null;
  return s;
}

/**
 * Turn an array of already-parsed record objects (from CSV or a sheet) into
 * validated rows. Shared by the CSV and Excel paths. Rejects on a missing
 * recipient column, an unrecognizable recipient, or a malformed amount.
 */
function rowsFromRecords(records: Record<string, unknown>[]): ImportResult {
  if (records.length === 0) {
    return { ok: false, error: "The file has no data rows." };
  }
  if (records.length > MAX_ROWS) {
    return { ok: false, error: `Too many rows (${records.length}). The limit is ${MAX_ROWS}.` };
  }

  // Locate the recipient and amount columns from the first record's keys.
  const keys = Object.keys(records[0]);
  const keyMap = new Map(keys.map((k) => [normalizeKey(k), k]));
  const recipientKey = RECIPIENT_KEYS.map((k) => keyMap.get(k)).find(Boolean);
  const amountKey = AMOUNT_KEYS.map((k) => keyMap.get(k)).find(Boolean);

  if (!recipientKey) {
    return {
      ok: false,
      error:
        "No recipient column found. Add a column named 'recipient' holding a wallet address or @handle.",
    };
  }

  const rows: ImportedRow[] = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const rawRecipient = rec[recipientKey];
    const recipient = rawRecipient === null || rawRecipient === undefined ? "" : String(rawRecipient).trim();

    // Skip fully blank rows (trailing newline artifacts) rather than failing.
    const rawAmountCell = amountKey ? rec[amountKey] : "";
    const amountBlank = rawAmountCell === null || rawAmountCell === undefined || String(rawAmountCell).trim() === "";
    if (recipient === "" && amountBlank) continue;

    if (recipient === "") {
      return { ok: false, error: `Row ${i + 1} has no recipient.` };
    }
    if (!looksLikeRecipient(recipient)) {
      return {
        ok: false,
        error: `Row ${i + 1}: "${recipient}" is not a wallet address or @handle.`,
      };
    }

    let amount = "";
    if (amountKey) {
      const cleaned = cleanAmount(rawAmountCell);
      if (cleaned === null) {
        return {
          ok: false,
          error: `Row ${i + 1}: "${String(rawAmountCell)}" is not a valid amount.`,
        };
      }
      amount = cleaned;
    }
    rows.push({ recipient, amount });
  }

  if (rows.length === 0) {
    return { ok: false, error: "The file has no usable recipient rows." };
  }
  return { ok: true, rows, hadAmountColumn: !!amountKey };
}

/** Parse CSV text into records, then validate. */
function parseCsv(text: string): ImportResult {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    return { ok: false, error: `CSV could not be read: ${first.message} (row ${(first.row ?? 0) + 1}).` };
  }
  return rowsFromRecords(parsed.data as Record<string, unknown>[]);
}

/**
 * Parse JSON. Two accepted shapes:
 *   - An array of objects: [{ recipient, amount? }, …]
 *   - An object with a `recipients` array of the same.
 * Anything else is rejected.
 */
function parseJson(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "The file is not valid JSON." };
  }
  let arr: unknown;
  if (Array.isArray(data)) arr = data;
  else if (data && typeof data === "object" && Array.isArray((data as { recipients?: unknown }).recipients)) {
    arr = (data as { recipients: unknown }).recipients;
  } else {
    return {
      ok: false,
      error: "JSON must be an array of { recipient, amount } objects, or { recipients: [...] }.",
    };
  }
  const list = arr as unknown[];
  if (list.some((el) => typeof el !== "object" || el === null || Array.isArray(el))) {
    return { ok: false, error: "Each JSON entry must be an object with a recipient field." };
  }
  return rowsFromRecords(list as Record<string, unknown>[]);
}

/** Parse the first sheet of an xlsx/xls workbook into records, then validate. */
function parseWorkbook(buf: ArrayBuffer): ImportResult {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "array" });
  } catch {
    return { ok: false, error: "The spreadsheet could not be read." };
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { ok: false, error: "The spreadsheet has no sheets." };
  const sheet = wb.Sheets[sheetName];
  // defval:"" so absent cells are present-and-blank, keeping columns aligned.
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rowsFromRecords(records);
}

/**
 * Entry point: sniff the file by extension, dispatch to the right parser, and
 * return validated rows or a specific rejection reason. Extension-driven so an
 * `.csv` renamed to `.json` fails loudly rather than being mis-parsed.
 */
export async function parseImportFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv");
  const isJson = name.endsWith(".json");
  const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");

  if (!isCsv && !isJson && !isExcel) {
    return {
      ok: false,
      error: "Unsupported file type. Upload a .csv, .json, .xlsx, or .xls file.",
    };
  }

  // Guard against absurd uploads before reading into memory (~5 MB is plenty
  // for 200 rows of addresses).
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "That file is too large (limit 5 MB)." };
  }

  try {
    if (isExcel) {
      const buf = await file.arrayBuffer();
      return parseWorkbook(buf);
    }
    const text = await file.text();
    return isJson ? parseJson(text) : parseCsv(text);
  } catch {
    return { ok: false, error: "The file could not be read." };
  }
}
