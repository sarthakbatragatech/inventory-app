export type InwardEstimationRow = {
  id?: string | null;
  item_id: string;
  inward_date?: string | null;
  quantity: number | null;
  unit?: string | null;
  color?: string | null;
  raw_row_no?: number | null;
  raw_payload?: Record<string, unknown> | null;
};

export type InwardQuantityEstimate = {
  method: 'current-lot-average' | 'previous-inward-average';
  inwardId: string | null;
  inwardDate: string | null;
  originalQuantity: number | null;
  originalUnit: string | null;
  originalKg: number;
  estimatedPcs: number;
  kgPerPc: number;
  normalizedColor: string;
  referenceInwardId: string | null;
  referenceInwardDate: string | null;
  referenceRawRowNo: number | null;
  referenceBasis: 'recorded-kg-and-pcs' | 'recorded-average';
};

export type NormalizedInwardRow<T extends InwardEstimationRow = InwardEstimationRow> = T & {
  estimate: InwardQuantityEstimate | null;
};

const PCS_HEADERS = ['Pcs', 'Pc', 'Pieces', 'Piece', 'Nos', 'Nos.'];
const KG_HEADERS = ['Kgs', 'Kg', 'Kilograms', 'In Kgs', 'Weight (kg)'];
const AVERAGE_HEADERS = [
  'Avg W, In Kgs', 'Avg W. In Kgs', 'Avg W In Kg', 'Avg W.', 'Avg W',
  'Avg Weight', 'Average Weight', 'Average Weight (kg)', 'Kg per pc', 'Kg/pc',
];

function headerKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rawValue(payload: Record<string, unknown>, names: readonly string[]) {
  const keys = new Set(names.map(headerKey));
  return Object.entries(payload).find(([key, value]) => keys.has(headerKey(key)) && value !== null && value !== undefined && value !== '')?.[1];
}

function positiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed = typeof value === 'number' ? value : Number(value.trim().replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function isPieceUnit(unit: string | null | undefined): boolean {
  return ['pc', 'pcs', 'piece', 'pieces', 'no', 'nos'].includes(unit?.trim().toLowerCase().replace(/\.$/, '') ?? '');
}

function isKgUnit(unit: string | null | undefined): boolean {
  return ['kg', 'kgs', 'kilogram', 'kilograms'].includes(unit?.trim().toLowerCase() ?? '');
}

function normalizeColor(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, ' ').toUpperCase() ?? '';
}

function validDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : null;
}

type Lot<T extends InwardEstimationRow> = {
  row: T;
  color: string;
  date: string | null;
  pcs: number | null;
  kgs: number | null;
  kgPerPc: number | null;
  basis: InwardQuantityEstimate['referenceBasis'];
  eligible: boolean;
};

function wholePieces(kgs: number, kgPerPc: number): number | null {
  const quotient = kgs / kgPerPc;
  // Correct only floating-point noise at an integer boundary; genuine fractions round down.
  const tolerance = Math.min(1e-7, Number.EPSILON * Math.max(1, Math.abs(quotient)) * 4);
  const result = Math.floor(quotient + tolerance);
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

/** Read-time estimates only: raw imported values and source records are never changed. */
export function normalizeInwardRows<T extends InwardEstimationRow>(
  rows: readonly T[],
  pieceItemIds: ReadonlySet<string>,
  canonicalColorByItemId: ReadonlyMap<string, string> = new Map(),
): NormalizedInwardRow<T>[] {
  const lots: Lot<T>[] = rows.map((row) => {
    const raw = row.raw_payload ?? {};
    const rawUnitValue = rawValue(raw, ['Unit']);
    const rawUnit = typeof rawUnitValue === 'string' ? rawUnitValue.trim() : null;
    const explicitPcs = positiveNumber(rawValue(raw, PCS_HEADERS));
    const pcs = explicitPcs ?? (isPieceUnit(rawUnit) ? positiveNumber(rawValue(raw, ['Qty', 'Quantity'])) : null);
    const kgs = positiveNumber(rawValue(raw, KG_HEADERS)) ?? (isKgUnit(row.unit) ? positiveNumber(row.quantity) : null);
    const average = positiveNumber(rawValue(raw, AVERAGE_HEADERS));
    const hasRatio = pcs !== null && kgs !== null;
    const rawColor = rawValue(raw, ['Color', 'Colour', 'Color/type', 'Colour/type']);
    const color = normalizeColor(row.color) || normalizeColor(typeof rawColor === 'string' ? rawColor : null) || normalizeColor(canonicalColorByItemId.get(row.item_id));
    // An explicit set/pair/other unit must never silently become individual pieces.
    const supportedUnit = !row.unit?.trim() || isPieceUnit(row.unit) || isKgUnit(row.unit);
    const supportedRawUnit = !rawUnit || isPieceUnit(rawUnit) || isKgUnit(rawUnit);
    return {
      row, color, date: validDate(row.inward_date), pcs, kgs,
      kgPerPc: hasRatio ? kgs / pcs : average,
      basis: hasRatio ? 'recorded-kg-and-pcs' : 'recorded-average',
      eligible: pieceItemIds.has(row.item_id) && supportedUnit && supportedRawUnit,
    };
  });

  const references = new Map<string, Lot<T>[]>();
  const lotKey = (lot: Lot<T>) => JSON.stringify([lot.row.item_id, lot.color]);
  for (const lot of lots) {
    // Only raw measured ratios/recorded averages establish a reference. Stored PCS derived
    // by the older pooled-weight importer, or an estimate calculated below, cannot do so.
    if (!lot.eligible || !lot.date || !lot.kgPerPc || !Number.isFinite(lot.kgPerPc)) continue;
    const key = lotKey(lot);
    const group = references.get(key) ?? [];
    group.push(lot);
    references.set(key, group);
  }
  for (const group of references.values()) {
    group.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')
      || (b.row.raw_row_no ?? 0) - (a.row.raw_row_no ?? 0)
      || String(b.row.id ?? '').localeCompare(String(a.row.id ?? '')));
  }

  return lots.map((lot) => {
    const original = { ...lot.row, estimate: null } as NormalizedInwardRow<T>;
    if (!lot.eligible) return original;
    if (lot.pcs !== null) return { ...original, quantity: lot.pcs, unit: 'PCS' };
    if (lot.kgs === null) return original;

    const reference = lot.kgPerPc !== null && Number.isFinite(lot.kgPerPc)
      ? lot
      : lot.date ? references.get(lotKey(lot))?.find((candidate) => candidate.date! < lot.date!) : undefined;
    const pcs = reference?.kgPerPc ? wholePieces(lot.kgs, reference.kgPerPc) : null;
    if (!reference || !reference.kgPerPc || pcs === null) {
      // Undo undocumented legacy conversion rather than present it as a recorded count.
      return { ...original, quantity: lot.kgs, unit: 'KGS' };
    }
    return {
      ...original,
      quantity: pcs,
      unit: 'PCS',
      estimate: {
        method: reference === lot ? 'current-lot-average' : 'previous-inward-average',
        inwardId: lot.row.id ?? null,
        inwardDate: lot.row.inward_date ?? null,
        originalQuantity: lot.row.quantity,
        originalUnit: lot.row.unit ?? null,
        originalKg: lot.kgs,
        estimatedPcs: pcs,
        kgPerPc: reference.kgPerPc,
        normalizedColor: lot.color,
        referenceInwardId: reference.row.id ?? null,
        referenceInwardDate: reference.row.inward_date ?? null,
        referenceRawRowNo: reference.row.raw_row_no ?? null,
        referenceBasis: reference.basis,
      },
    };
  });
}
