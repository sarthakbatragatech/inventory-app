import { PrintPreviewActions } from '@/components/bom/print-preview-actions';
import { filterStockListItems, getStockListItems } from '@/lib/stock';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    family?: string;
    category?: string;
  }>;
};

function formatQuantity(quantity: number, unit: string | null) {
  const rounded = quantity.toFixed(2).replace(/\.?0+$/, '');
  return unit ? `${rounded} ${unit}` : rounded;
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

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-6">
      <div className="mx-auto max-w-4xl rounded-3xl border border-dashed border-neutral-300 bg-white p-8 text-sm text-neutral-500">
        {message}
      </div>
    </div>
  );
}

export default async function StockPrintPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const q = params.q?.trim() ?? '';
  const family = params.family?.trim() ?? '';
  const category = params.category?.trim() ?? '';

  const items = await getStockListItems();
  const filteredItems = filterStockListItems(items, { q, family, category }).sort((left, right) =>
    left.item_name.localeCompare(right.item_name) ||
    left.sku.localeCompare(right.sku)
  );

  if (!filteredItems.length) {
    return <EmptyState message="No stock rows match the selected inventory filters." />;
  }

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-6 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-stone-300 bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-8 print:shadow-none">
        <PrintPreviewActions description="Use Print to open the browser's print preview for this stock snapshot." />

        <div className="border-b border-neutral-200 pb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Inventory Print Preview
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">
            Stock Snapshot
          </h1>
          <div className="mt-2 text-sm text-neutral-600">
            Current inventory view with the selected filters applied.
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Search
            </div>
            <div className="mt-2 text-lg font-semibold text-neutral-950">{q || 'All SKUs'}</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Family
            </div>
            <div className="mt-2 text-lg font-semibold text-neutral-950">{family || 'All Families'}</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Category
            </div>
            <div className="mt-2 text-lg font-semibold text-neutral-950">
              {category ? formatCategory(category) : 'All Categories'}
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Rows
            </div>
            <div className="mt-2 text-lg font-semibold text-neutral-950">{filteredItems.length}</div>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-3xl border border-neutral-200">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Family</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Inward</th>
                <th className="px-4 py-3 font-semibold">Consumed</th>
                <th className="px-4 py-3 font-semibold">Threshold</th>
                <th className="px-4 py-3 font-semibold">Balance</th>
                <th className="px-4 py-3 font-semibold">Last Inward</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id} className="border-t border-neutral-200 align-top">
                  <td className="px-4 py-3 font-medium text-neutral-700">{item.sku}</td>
                  <td className="px-4 py-3">{item.item_name}</td>
                  <td className="px-4 py-3">{item.families.join(', ') || '—'}</td>
                  <td className="px-4 py-3">{formatCategory(item.category)}</td>
                  <td className="px-4 py-3 font-semibold">
                    {formatQuantity(item.inwardQty, item.default_unit)}
                  </td>
                  <td className="px-4 py-3">{formatQuantity(item.consumedQty, item.default_unit)}</td>
                  <td className="px-4 py-3">
                    {formatQuantity(item.reorderThresholdQty, item.default_unit)}
                  </td>
                  <td
                    className={`px-4 py-3 font-semibold ${
                      item.balanceQty < item.reorderThresholdQty
                        ? 'text-rose-700'
                        : 'text-neutral-900'
                    }`}
                  >
                    {formatQuantity(item.balanceQty, item.default_unit)}
                  </td>
                  <td className="px-4 py-3">
                    <div>{formatDate(item.lastInward)}</div>
                    <div className="text-xs text-neutral-500">
                      {item.lastInwardQty !== null
                        ? formatQuantity(item.lastInwardQty, item.lastInwardUnit || item.default_unit)
                        : '—'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
