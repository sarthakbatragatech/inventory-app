import readExcelFile, { type SheetData } from 'read-excel-file/node';
import { normalizeItemName } from './sku-normalizer';

export type ParsedInwardRow = {
  rawRowNo: number;
  rawItemName: string;
  normalizedItemName: string;
  quantity: number | null;
  unit: string | null;
  inwardDate: string | null;
  color: string | null;
  rawPayload: Record<string, unknown>;
};

const ITEM_NAME_KEYS = ['Item Name', 'Item Description', 'item_name', 'Item', 'Description'];
const PCS_KEYS = ['Pcs', 'PCS', 'Pieces', 'Piece', 'Nos', 'Nos.'];
const KG_KEYS = ['Kgs', 'KGs', 'Kg', 'KG', 'kgs', 'kg'];
const GENERIC_QTY_KEYS = ['Qty', 'Quantity', 'qty', 'quantity'];
const UNIT_KEYS = ['Unit', 'unit'];
const DATE_KEYS = ['Date', 'Inward Date', 'date', 'inward_date'];
const COLOR_KEYS = ['Color', 'Colour', 'Color/type', 'Colour/type'];

function normalizeHeaderKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getRowValue(
  row: Record<string, unknown>,
  candidates: string[]
): unknown {
  for (const candidate of candidates) {
    if (candidate in row) {
      return row[candidate];
    }
  }

  const normalizedCandidates = new Set(candidates.map(normalizeHeaderKey));

  for (const [key, value] of Object.entries(row)) {
    if (normalizedCandidates.has(normalizeHeaderKey(key))) {
      return value;
    }
  }

  return null;
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function excelSerialToDate(value: number) {
  const excelEpoch = Date.UTC(1899, 11, 30);
  return new Date(excelEpoch + Math.floor(value) * 86_400_000);
}

function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    const parsed = excelSerialToDate(value);
    if (isNaN(parsed.getTime())) return null;

    return formatDateParts(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth() + 1,
      parsed.getUTCDate()
    );
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatDateParts(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate()
    );
  }

  const str = String(value).trim();
  if (!str) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return formatDateParts(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);

    if (year < 100) year += 2000;

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return formatDateParts(year, month, day);
    }
  }

  return null;
}

function parseQuantity(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).replace(/[^\d.-]/g, '');
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sheetDataToRows(data: SheetData) {
  if (data.length < 1) {
    return [] as Record<string, unknown>[];
  }

  const headerByColumn = new Map<number, string>();

  for (let column = 0; column < data[0].length; column += 1) {
    const header = String(data[0][column] ?? '').trim();
    if (header) {
      headerByColumn.set(column, header);
    }
  }

  const rows: Record<string, unknown>[] = [];
  for (let rowIndex = 1; rowIndex < data.length; rowIndex += 1) {
    const sheetRow = data[rowIndex];
    const row: Record<string, unknown> = {};

    for (const [column, header] of headerByColumn) {
      row[header] = sheetRow[column] ?? null;
    }

    rows.push(row);
  }

  return rows;
}

function parseSheetData(data: SheetData): ParsedInwardRow[] {
  return sheetDataToRows(data)
    .map((row, index) => {
      const rawItemName = String(getRowValue(row, ITEM_NAME_KEYS) ?? '').trim();

      const pcsQuantity = parseQuantity(getRowValue(row, PCS_KEYS));
      const kgQuantity = parseQuantity(getRowValue(row, KG_KEYS));
      const genericQuantity = parseQuantity(getRowValue(row, GENERIC_QTY_KEYS));

      const quantity = pcsQuantity ?? kgQuantity ?? genericQuantity;

      const rawUnit = getRowValue(row, UNIT_KEYS);
      const unit =
        pcsQuantity !== null
          ? 'PCS'
          : kgQuantity !== null
            ? 'KGS'
            : rawUnit === null || rawUnit === undefined
              ? null
              : String(rawUnit);

      const inwardDate = toIsoDate(getRowValue(row, DATE_KEYS));
      const rawColor = getRowValue(row, COLOR_KEYS);
      const color =
        rawColor === null || rawColor === undefined || rawColor === ''
          ? null
          : String(rawColor);

      return {
        rawRowNo: index + 2,
        rawItemName,
        normalizedItemName: normalizeItemName(rawItemName),
        quantity,
        unit,
        inwardDate,
        color,
        rawPayload: row,
      };
    })
    .filter((row) => row.rawItemName);
}

function scoreParsedRows(rows: ParsedInwardRow[]) {
  const headerKeys = new Set(
    rows.flatMap((row) => Object.keys(row.rawPayload).map(normalizeHeaderKey))
  );
  const rowsWithQuantity = rows.filter((row) => row.quantity !== null).length;
  const rowsWithDate = rows.filter((row) => row.inwardDate !== null).length;
  const rowsWithQuantityAndDate = rows.filter(
    (row) => row.quantity !== null && row.inwardDate !== null
  ).length;

  const headerScore =
    (DATE_KEYS.some((key) => headerKeys.has(normalizeHeaderKey(key))) ? 40 : 0) +
    ([...PCS_KEYS, ...KG_KEYS, ...GENERIC_QTY_KEYS].some((key) =>
      headerKeys.has(normalizeHeaderKey(key))
    )
      ? 40
      : 0) +
    (headerKeys.has(normalizeHeaderKey('Avg W, In Kgs')) ? 15 : 0);

  return (
    headerScore +
    rowsWithQuantityAndDate * 12 +
    rowsWithQuantity * 4 +
    rowsWithDate * 4 +
    rows.length
  );
}

function scoreSheetName(sheetName: string) {
  const normalizedName = sheetName.trim().toLowerCase();
  if (normalizedName === 'inward') {
    return 1_000_000;
  }

  return normalizedName.includes('inward') ? 500_000 : 0;
}

export async function parseInwardWorkbook(buffer: Buffer): Promise<ParsedInwardRow[]> {
  const workbookSheets = await readExcelFile(buffer);
  const parsedSheets = workbookSheets
    .map((sheet) => ({
      sheetName: sheet.sheet,
      rows: parseSheetData(sheet.data),
    }))
    .filter((sheet) => sheet.rows.length > 0);

  if (!parsedSheets.length) {
    return [];
  }

  parsedSheets.sort((left, right) => {
    const scoreDelta =
      scoreSheetName(right.sheetName) + scoreParsedRows(right.rows) -
      (scoreSheetName(left.sheetName) + scoreParsedRows(left.rows));
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return workbookSheets.findIndex((sheet) => sheet.sheet === left.sheetName) -
      workbookSheets.findIndex((sheet) => sheet.sheet === right.sheetName);
  });

  return parsedSheets[0].rows;
}
