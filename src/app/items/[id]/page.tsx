import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ItemHeaderEditor } from '@/components/items/item-detail-client';
import { InwardHistoryEditor } from '@/components/items/inward-history-editor';
import { InwardTrendChart } from '@/components/items/inward-trend-chart';
import { selectNewestBatchPerFileName } from '@/lib/import-batches';
import { deriveItemFamily } from '@/lib/item-family';
import { resolveItemFamilies } from '@/lib/item-family-links';
import { normalizeItemName } from '@/lib/sku-normalizer';
import { getSupabaseServerClient } from '@/lib/supabase';

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type BatchRecord = {
  id: string;
  file_name: string;
  uploaded_at: string;
  status: string;
};

type ItemRecord = {
  id: string;
  sku: string;
  item_name: string;
  normalized_name: string;
  family: string | null;
  category: string | null;
  default_unit: string | null;
  created_at: string;
  active: boolean;
};

type AliasRecord = {
  alias: string;
};

type ImportRowRecord = {
  id: string;
  batch_id: string;
  raw_row_no: number;
  raw_item_name: string;
  quantity: number | null;
  unit: string | null;
  color: string | null;
  inward_date: string | null;
  raw_payload: Record<string, unknown> | null;
};

type HistoryRow = ImportRowRecord & {
  displayUnit: string | null;
  supplier: string | null;
  batch: BatchRecord | null;
};

type ItemOptionRecord = {
  id: string;
  sku: string;
  item_name: string;
  default_unit: string | null;
};

function normalizeDisplayUnit(unit: string | null): string | null {
  if (!unit) {
    return null;
  }

  if (unit === 'KGS' || unit === 'kg') {
    return 'kg';
  }

  if (unit === 'PCS' || unit === 'pcs') {
    return 'pcs';
  }

  return unit.toLowerCase();
}

function formatQuantity(quantity: number, unit: string | null) {
  const rounded = quantity.toFixed(2).replace(/\.?0+$/, '');
  return unit ? `${rounded} ${unit}` : rounded;
}

function formatInwardDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function normalizeAliasForComparison(value: string) {
  return normalizeItemName(value)
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSupplier(rawPayload: Record<string, unknown> | null): string | null {
  if (!rawPayload) {
    return null;
  }

  const candidate = rawPayload['Supplier'] ?? rawPayload['supplier'] ?? rawPayload['Vendor'] ?? rawPayload['vendor'] ?? null;
  const normalized = typeof candidate === 'string' ? candidate.trim() : String(candidate ?? '').trim();

  return normalized || null;
}

function formatCategory(value: string | null) {
  return String(value ?? 'raw_material')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getLastInwardValueClasses(value: string) {
  if (value.length >= 28) {
    return 'text-[1.05rem] sm:text-[1.1rem] lg:text-[1rem] xl:text-[1.15rem]';
  }

  if (value.length >= 24) {
    return 'text-[1.15rem] sm:text-[1.2rem] lg:text-[1.08rem] xl:text-[1.28rem]';
  }

  if (value.length >= 20) {
    return 'text-[1.28rem] sm:text-[1.4rem] lg:text-[1.25rem] xl:text-[1.5rem]';
  }

  return 'text-[1.45rem] sm:text-[1.7rem] lg:text-[1.6rem] xl:text-[1.85rem]';
}

function getSupplierValueClasses(value: string) {
  if (value.length >= 26) {
    return 'text-[1rem] sm:text-[1.08rem] lg:text-[0.98rem] xl:text-[1.12rem]';
  }

  if (value.length >= 20) {
    return 'text-[1.1rem] sm:text-[1.18rem] lg:text-[1.05rem] xl:text-[1.22rem]';
  }

  if (value.length >= 14) {
    return 'text-[1.28rem] sm:text-[1.38rem] lg:text-[1.2rem] xl:text-[1.45rem]';
  }

  return 'text-[1.5rem] sm:text-[1.62rem] lg:text-[1.4rem] xl:text-[1.75rem]';
}

export default async function ItemPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { data: item, error: itemError } = await supabase
    .from('items')
    .select(
      'id, sku, item_name, normalized_name, family, category, default_unit, created_at, active'
    )
    .eq('id', id)
    .eq('active', true)
    .maybeSingle();

  if (itemError) {
    throw new Error(itemError.message);
  }

  if (!item) {
    notFound();
  }

  const currentItem = item as ItemRecord;

  const [
    { data: aliases, error: aliasError },
    { data: batches, error: batchError },
    { data: itemOptionsData, error: itemOptionsError },
  ] =
    await Promise.all([
      supabase.from('item_aliases').select('alias').eq('item_id', id).order('alias'),
      supabase
        .from('import_batches')
        .select('id, file_name, uploaded_at, status')
        .eq('status', 'processed')
        .order('uploaded_at', { ascending: false }),
      supabase
        .from('items')
        .select('id, sku, item_name, default_unit')
        .eq('active', true)
        .order('item_name', { ascending: true })
        .limit(2000),
    ]);

  if (aliasError) {
    throw new Error(aliasError.message);
  }

  if (batchError) {
    throw new Error(batchError.message);
  }

  if (itemOptionsError) {
    throw new Error(itemOptionsError.message);
  }

  const latestBatches = selectNewestBatchPerFileName(
    (batches ?? []) as BatchRecord[]
  );

  const batchIds = latestBatches.map((batch) => batch.id);
  const batchById = new Map(latestBatches.map((batch) => [batch.id, batch]));

  const importRows: ImportRowRecord[] = [];

  for (let index = 0; index < batchIds.length; index += 100) {
    const batchChunk = batchIds.slice(index, index + 100);
    const { data, error } = await supabase
      .from('import_batch_rows')
      .select(
        'id, batch_id, raw_row_no, raw_item_name, quantity, unit, color, inward_date, raw_payload'
      )
      .eq('item_id', id)
      .in('batch_id', batchChunk);

    if (error) {
      throw new Error(error.message);
    }

    importRows.push(...((data ?? []) as ImportRowRecord[]));
  }

  const historyRows: HistoryRow[] = importRows
    .sort((left, right) => {
      if (!left.inward_date && !right.inward_date) {
        return right.raw_row_no - left.raw_row_no;
      }

      if (!left.inward_date) {
        return 1;
      }

      if (!right.inward_date) {
        return -1;
      }

      const dateComparison =
        new Date(right.inward_date as string).getTime() -
        new Date(left.inward_date as string).getTime();

      if (dateComparison !== 0) {
        return dateComparison;
      }

      return right.raw_row_no - left.raw_row_no;
    })
    .map((row) => ({
      ...row,
      displayUnit: normalizeDisplayUnit(row.unit),
      supplier: extractSupplier(row.raw_payload),
      batch: batchById.get(row.batch_id) ?? null,
    }));

  const rowUnits = [
    ...new Set(
      historyRows
        .map((row) => row.displayUnit)
        .filter((unit): unit is string => Boolean(unit))
    ),
  ];
  const totalQty = historyRows.reduce((sum, row) => sum + (row.quantity || 0), 0);
  const lastInward = historyRows.find((row) => Boolean(row.inward_date)) ?? null;
  const displayUnit =
    rowUnits.length === 1
      ? rowUnits[0]
      : normalizeDisplayUnit(currentItem.default_unit);
  const aliasesList = ((aliases ?? []) as AliasRecord[])
    .map((record) => record.alias.trim())
    .filter(Boolean);
  const normalizedCurrentName = normalizeAliasForComparison(currentItem.item_name);
  const visibleAliases = aliasesList.filter(
    (alias) => normalizeAliasForComparison(alias) !== normalizedCurrentName
  );
  const itemOptions = ((itemOptionsData ?? []) as ItemOptionRecord[]).map((option) => ({
    id: option.id,
    sku: option.sku,
    item_name: option.item_name,
    default_unit: normalizeDisplayUnit(option.default_unit),
  }));
  const { familyByItemId } = await resolveItemFamilies([currentItem]);
  const derivedFamily =
    currentItem.family || deriveItemFamily(currentItem.item_name, currentItem.sku);
  const families = familyByItemId.get(currentItem.id) ?? (derivedFamily ? [derivedFamily] : []);
  const primaryFamily = families[0] ?? null;
  const sharedFamilies = families.slice(1);
  const suppliers = [...new Set(historyRows.map((row) => row.supplier).filter((value): value is string => Boolean(value)))];
  const lastInwardDisplay = lastInward?.inward_date
    ? formatInwardDate(lastInward.inward_date)
    : '—';
  const lastInwardQuantityDisplay =
    lastInward?.quantity !== null && lastInward?.quantity !== undefined
      ? formatQuantity(lastInward.quantity, lastInward.displayUnit || displayUnit)
      : null;
  const lastInwardSummary = `${lastInwardDisplay}${
    lastInwardQuantityDisplay ? ` (${lastInwardQuantityDisplay})` : ''
  }`;
  const supplierSummary = suppliers.length ? suppliers.join(', ') : 'Unknown';
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fafaf9_0%,#f8fafc_40%,#ffffff_100%)] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-3">
          <Link
            href="/items"
            className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/90 px-4 py-2 text-sm font-medium text-neutral-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-900"
          >
            <span aria-hidden="true" className="text-base leading-none">←</span>
            Back to SKU List
          </Link>
          <div className="relative overflow-hidden rounded-[2rem] border border-neutral-200/80 bg-white p-6 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.28)] sm:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.1),transparent_30%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,250,252,0.88))]" />
            <div className="pointer-events-none absolute -left-12 top-24 h-44 w-44 rounded-full bg-sky-100/50 blur-3xl" />
            <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 rounded-full bg-amber-100/50 blur-3xl" />

            <div className="relative space-y-6">
              <div className="min-w-0 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  {currentItem.sku}
                </p>
                <div>
                  <h1 className="text-4xl font-semibold tracking-tight text-neutral-950 sm:text-5xl">
                    {currentItem.item_name}
                  </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex rounded-full border border-neutral-200 bg-white/85 px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm">
                    Primary Family: {primaryFamily ?? 'Unknown'}
                  </span>
                  <span className="inline-flex rounded-full border border-amber-200 bg-amber-50/90 px-4 py-2 text-sm font-medium text-amber-900 shadow-sm">
                    Category: {formatCategory(currentItem.category)}
                  </span>
                  <ItemHeaderEditor itemId={String(currentItem.id)} />
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <div className="min-w-0 rounded-[1.6rem] border border-sky-200/80 bg-[linear-gradient(180deg,rgba(240,249,255,0.96),rgba(255,255,255,0.96))] px-5 py-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-sky-700/70">
                    Total Inward Quantity
                  </p>
                  <p className="mt-1.5 break-words text-3xl font-semibold tracking-tight text-neutral-950 sm:text-[2.25rem]">
                    {formatQuantity(totalQty, displayUnit)}
                  </p>
                </div>
                <div className="min-w-0 rounded-[1.6rem] border border-amber-200/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.96),rgba(255,255,255,0.96))] px-5 py-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-amber-700/75">
                    Last Inward
                  </p>
                  <p
                    className={`mt-1.5 whitespace-nowrap font-semibold leading-tight tracking-tight text-neutral-950 ${getLastInwardValueClasses(lastInwardSummary)}`}
                  >
                    {lastInwardSummary}
                  </p>
                </div>
                <div className="min-w-0 rounded-[1.6rem] border border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(255,255,255,0.96))] px-5 py-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700/75">
                    Suppliers
                  </p>
                  <p
                    className={`mt-1.5 whitespace-nowrap font-semibold leading-tight tracking-tight text-neutral-950 ${getSupplierValueClasses(supplierSummary)}`}
                  >
                    {supplierSummary}
                  </p>
                </div>
              </div>

              {sharedFamilies.length || visibleAliases.length > 0 ? (
                <div className="border-t border-neutral-200/80 pt-5">
                  <div className="flex flex-wrap gap-2">
                    {sharedFamilies.length ? (
                      <span className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm">
                        Shared Families: {sharedFamilies.join(', ')}
                      </span>
                    ) : null}
                    {visibleAliases.length > 0 ? (
                      <span className="inline-flex rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700">
                        Known aliases
                      </span>
                    ) : null}
                    {visibleAliases.map((alias) => (
                      <span
                        key={alias}
                        className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm"
                      >
                        {alias}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
          {historyRows.length ? (
            <div className="px-6 py-6">
              <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-4">
                <InwardTrendChart />
              </div>
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-sm text-neutral-600">
              No inward data available to chart yet.
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-neutral-950">Inward History</h2>
            <p className="mt-1 text-sm text-neutral-600">
              {historyRows.length} inward {historyRows.length === 1 ? 'entry' : 'entries'}
            </p>
          </div>

          {historyRows.length ? (
            <div className="overflow-x-auto">
              <InwardHistoryEditor
                currentItemId={currentItem.id}
                currentItemSku={currentItem.sku}
                rows={historyRows}
                itemOptions={itemOptions}
              />
            </div>
          ) : (
            <div className="px-6 py-12 text-center text-sm text-neutral-600">
              No inward history found for this item.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
