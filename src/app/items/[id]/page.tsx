import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InwardTrendChart } from '@/components/items/inward-trend-chart';
import { deriveItemFamily } from '@/lib/item-family';
import { resolveItemFamilies } from '@/lib/item-family-links';
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

function formatCategory(category: string | null) {
  if (!category) {
    return 'Unknown';
  }

  return category
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getCategoryStyles(category: string | null) {
  switch (category) {
    case 'plastic_part':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'electronic':
      return 'bg-sky-100 text-sky-900 border-sky-200';
    case 'metal_part':
      return 'bg-slate-200 text-slate-900 border-slate-300';
    case 'packaging':
      return 'bg-emerald-100 text-emerald-900 border-emerald-200';
    case 'raw_material':
      return 'bg-rose-100 text-rose-900 border-rose-200';
    default:
      return 'bg-neutral-100 text-neutral-700 border-neutral-200';
  }
}

function extractSupplier(rawPayload: Record<string, unknown> | null): string | null {
  if (!rawPayload) {
    return null;
  }

  const candidate = rawPayload['Supplier'] ?? rawPayload['supplier'] ?? rawPayload['Vendor'] ?? rawPayload['vendor'] ?? null;
  const normalized = typeof candidate === 'string' ? candidate.trim() : String(candidate ?? '').trim();

  return normalized || null;
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

  const [{ data: aliases, error: aliasError }, { data: batches, error: batchError }] =
    await Promise.all([
      supabase.from('item_aliases').select('alias').eq('item_id', id).order('alias'),
      supabase
        .from('import_batches')
        .select('id, file_name, uploaded_at, status')
        .eq('status', 'processed')
        .order('uploaded_at', { ascending: false }),
    ]);

  if (aliasError) {
    throw new Error(aliasError.message);
  }

  if (batchError) {
    throw new Error(batchError.message);
  }

  const latestBatches = [
    ...new Map(
      ((batches ?? []) as BatchRecord[]).map((batch) => [batch.file_name, batch])
    ).values(),
  ];

  const batchIds = latestBatches.map((batch) => batch.id);
  const batchById = new Map(latestBatches.map((batch) => [batch.id, batch]));

  const importRows: ImportRowRecord[] = [];

  for (let index = 0; index < batchIds.length; index += 100) {
    const batchChunk = batchIds.slice(index, index + 100);
    const { data, error } = await supabase
      .from('import_batch_rows')
      .select(
        'batch_id, raw_row_no, raw_item_name, quantity, unit, color, inward_date, raw_payload'
      )
      .eq('item_id', id)
      .in('batch_id', batchChunk);

    if (error) {
      throw new Error(error.message);
    }

    importRows.push(...((data ?? []) as ImportRowRecord[]));
  }

  const historyRows: HistoryRow[] = importRows
    .filter((row) => row.inward_date)
    .sort((left, right) => {
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
  const lastInward = historyRows[0] ?? null;
  const displayUnit =
    rowUnits.length === 1
      ? rowUnits[0]
      : normalizeDisplayUnit(currentItem.default_unit);
  const aliasesList = ((aliases ?? []) as AliasRecord[]).map((record) => record.alias);
  const { familyByItemId } = await resolveItemFamilies([currentItem]);
  const derivedFamily =
    currentItem.family || deriveItemFamily(currentItem.item_name, currentItem.sku);
  const families = familyByItemId.get(currentItem.id) ?? (derivedFamily ? [derivedFamily] : []);
  const primaryFamily = families[0] ?? null;
  const sharedFamilies = families.slice(1);
  const suppliers = [...new Set(historyRows.map((row) => row.supplier).filter((value): value is string => Boolean(value)))];

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-3">
          <Link
            href="/items"
            className="inline-flex text-sm text-neutral-600 underline decoration-neutral-300 underline-offset-4 transition hover:text-neutral-900 hover:decoration-neutral-900"
          >
            Back to SKU List
          </Link>
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                  {currentItem.sku}
                </p>
                <div>
                  <h1 className="text-3xl font-semibold text-neutral-950">
                    {currentItem.item_name}
                  </h1>
                  <p className="mt-2 text-sm text-neutral-600">
                    Inward history across the latest successful import for each file.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {primaryFamily ? (
                    <span className="inline-flex rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                      Primary Family: {primaryFamily}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                      Primary Family: Unknown
                    </span>
                  )}
                  {sharedFamilies.length ? (
                    <span className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700">
                      Shared Families: {sharedFamilies.join(', ')}
                    </span>
                  ) : null}
                  {suppliers.length ? (
                    <span className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700">
                      Suppliers: {suppliers.join(', ')}
                    </span>
                  ) : null}
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getCategoryStyles(
                      currentItem.category
                    )}`}
                  >
                    Category: {formatCategory(currentItem.category)}
                  </span>
                  {aliasesList.length > 0 ? (
                    <span className="inline-flex rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                      Known aliases
                    </span>
                  ) : null}
                  {aliasesList.map((alias) => (
                    <span
                      key={alias}
                      className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700"
                    >
                      {alias}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">
                    Total Quantity
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-neutral-950">
                    {formatQuantity(totalQty, displayUnit)}
                  </p>
                </div>
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">
                    Last Inward
                  </p>
                  <p className="mt-2 text-lg font-semibold text-neutral-950">
                    {lastInward?.inward_date
                      ? formatInwardDate(lastInward.inward_date)
                      : '—'}
                  </p>
                  <p className="mt-1 text-sm text-neutral-600">
                    {lastInward?.quantity !== null && lastInward?.quantity !== undefined
                      ? formatQuantity(
                          lastInward.quantity,
                          lastInward.displayUnit || displayUnit
                        )
                      : 'No inward rows'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-neutral-950">Quantity Over Time</h2>
          </div>

          {historyRows.length ? (
            <div className="px-6 py-6">
              <div className="rounded-[1.75rem] border border-neutral-200 bg-neutral-50 p-4">
                <InwardTrendChart />
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                Hover points to inspect exact inward quantities over time.
              </p>
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
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-100 text-left text-neutral-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Quantity</th>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold">Color / Type</th>
                  <th className="px-4 py-3 font-semibold">Imported As</th>
                  <th className="px-4 py-3 font-semibold">Source File</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr key={`${row.batch_id}-${row.raw_row_no}`} className="border-t border-neutral-200">
                    <td className="px-4 py-3 text-neutral-700">
                      {row.inward_date ? formatInwardDate(row.inward_date) : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-neutral-950">
                      {row.quantity !== null && row.quantity !== undefined
                        ? formatQuantity(row.quantity, row.displayUnit)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{row.supplier || '—'}</td>
                    <td className="px-4 py-3 text-neutral-700">{row.color || '—'}</td>
                    <td className="px-4 py-3 text-neutral-700">{row.raw_item_name || '—'}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      <div>{row.batch?.file_name || '—'}</div>
                      <div className="text-xs text-neutral-500">
                        Row {row.raw_row_no}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
