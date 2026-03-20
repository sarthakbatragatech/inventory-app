import * as XLSX from 'xlsx';
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

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;

    return formatDateParts(parsed.y, parsed.m, parsed.d);
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

export function parseInwardWorkbook(buffer: Buffer): ParsedInwardRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheet = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: null,
    raw: true,
  });

  return rows
    .map((row, index) => {
      const rawItemName = String(
        row['Item Name'] ??
          row['Item Description'] ??
          row['item_name'] ??
          row['Item'] ??
          row['Description'] ??
          ''
      ).trim();

      const pcsQuantity = parseQuantity(row['Pcs']);
      const kgQuantity = parseQuantity(row['Kgs']);
      const genericQuantity = parseQuantity(
        row['Qty'] ?? row['Quantity'] ?? row['qty'] ?? null
      );

      const quantity =
        pcsQuantity ?? kgQuantity ?? genericQuantity;

      const unit =
        pcsQuantity !== null
          ? 'PCS'
          : kgQuantity !== null
            ? 'KGS'
            : ((row['Unit'] ?? row['unit'] ?? null) as string | null);

      const inwardDateValue = row['Date'] ?? row['Inward Date'] ?? null;
      const inwardDate = toIsoDate(inwardDateValue);

      const color = (
        row['Color'] ??
        row['Colour'] ??
        row['Color/type'] ??
        null
      ) as string | null;

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
    .filter((r) => r.rawItemName);
}
