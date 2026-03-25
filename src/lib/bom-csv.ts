type CsvTable = {
  headers: string[];
  rows: string[][];
};

export type BomCsvRow = {
  sortOrder: number;
  componentSku: string;
  componentName: string;
  qtyPerFg: number;
  unit: string | null;
  notes: string | null;
};

const REQUIRED_HEADERS = ['component_sku', 'qty_per_fg'] as const;

function normalizeHeader(value: string) {
  return value.trim().toLowerCase();
}

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function parseCsvTable(input: string): CsvTable {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = false;
        continue;
      }

      currentCell += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (char === '\n') {
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    if (char === '\r') {
      if (nextChar === '\n') {
        continue;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  const hasContent = currentRow.some((cell) => cell.length > 0);
  if (hasContent || rows.length === 0) {
    rows.push(currentRow);
  }

  const nonEmptyRows = rows.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (!nonEmptyRows.length) {
    throw new Error('The CSV file is empty.');
  }

  const [headerRow, ...dataRows] = nonEmptyRows;
  const headers = headerRow.map(normalizeHeader);

  return {
    headers,
    rows: dataRows,
  };
}

export function parseBomCsv(input: string) {
  const table = parseCsvTable(input);
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !table.headers.includes(header));

  if (missingHeaders.length > 0) {
    throw new Error(`Missing required CSV columns: ${missingHeaders.join(', ')}`);
  }

  const rows = table.rows.map((row, index) => {
    const values = Object.fromEntries(
      table.headers.map((header, headerIndex) => [header, row[headerIndex] ?? ''])
    );

    const componentSku = values.component_sku.trim().toUpperCase();
    const componentName = values.component_name.trim();
    const qtyPerFg = Number(values.qty_per_fg.trim());
    const unit = values.unit.trim() || null;
    const notes = values.notes.trim() || null;
    const sortOrderValue = values.sort_order.trim();
    const sortOrder = sortOrderValue ? Number(sortOrderValue) : index;

    if (!componentSku) {
      throw new Error(`Row ${index + 2} is missing component_sku.`);
    }

    if (!Number.isFinite(qtyPerFg) || qtyPerFg <= 0) {
      throw new Error(`Row ${index + 2} has an invalid qty_per_fg.`);
    }

    if (!Number.isFinite(sortOrder)) {
      throw new Error(`Row ${index + 2} has an invalid sort_order.`);
    }

    return {
      sortOrder,
      componentSku,
      componentName,
      qtyPerFg,
      unit,
      notes,
    } satisfies BomCsvRow;
  });

  const duplicateSkus = [
    ...new Set(
      rows
        .map((row) => row.componentSku)
        .filter(
          (componentSku, index, values) => values.indexOf(componentSku) !== index
        )
    ),
  ];

  if (duplicateSkus.length > 0) {
    throw new Error(`Duplicate component_sku values are not allowed: ${duplicateSkus.join(', ')}`);
  }

  return rows.sort((left, right) => left.sortOrder - right.sortOrder);
}

export function serializeBomCsv(
  rows: Array<{
    sort_order: number;
    component_sku: string;
    component_name: string;
    qty_per_fg: number;
    unit: string | null;
    notes: string | null;
  }>
) {
  const header = [
    'sort_order',
    'component_sku',
    'component_name',
    'qty_per_fg',
    'unit',
    'notes',
  ];

  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        String(row.sort_order),
        row.component_sku,
        row.component_name,
        String(row.qty_per_fg),
        row.unit ?? '',
        row.notes ?? '',
      ]
        .map(escapeCsvCell)
        .join(',')
    ),
  ];

  return `${lines.join('\n')}\n`;
}
