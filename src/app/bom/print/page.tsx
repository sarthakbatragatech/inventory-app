import { PrintPreviewActions } from '@/components/bom/print-preview-actions';
import { getBomDetailBySku } from '@/lib/bom';
import { getStockSnapshotByFgSku } from '@/lib/stock';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{
    fgSku?: string;
    versionId?: string;
  }>;
};

function formatQuantity(quantity: number, unit: string | null) {
  const rounded = quantity.toFixed(3).replace(/\.?0+$/, '');
  return unit ? `${rounded} ${unit}` : rounded;
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

export default async function BomPrintPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const fgSku = params.fgSku?.trim().toUpperCase() ?? '';

  if (!fgSku) {
    return (
      <div className="min-h-screen bg-neutral-100 px-4 py-6">
        <div className="mx-auto max-w-4xl rounded-3xl border border-dashed border-neutral-300 bg-white p-8 text-sm text-neutral-500">
          Choose a BOM from the BOM Management page to open print preview.
        </div>
      </div>
    );
  }

  const detail = await getBomDetailBySku(fgSku);

  if (!detail) {
    return (
      <div className="min-h-screen bg-neutral-100 px-4 py-6">
        <div className="mx-auto max-w-4xl rounded-3xl border border-dashed border-neutral-300 bg-white p-8 text-sm text-neutral-500">
          No BOM exists for {fgSku}.
        </div>
      </div>
    );
  }

  const selectedVersion =
    detail.versions.find((version) => version.id === params.versionId) ?? detail.versions[0] ?? null;
  const snapshot = await getStockSnapshotByFgSku(detail.model.fg_sku);
  const stockByItemId = new Map(
    (snapshot?.components ?? []).map((component) => [component.componentItemId, component])
  );

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-6 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-6xl rounded-[2rem] border border-stone-300 bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-8 print:shadow-none">
        <PrintPreviewActions />

        {!selectedVersion ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 px-6 py-8 text-sm text-neutral-500">
            No BOM version exists for this model yet.
          </div>
        ) : (
          <>
            <div className="border-b border-neutral-200 pb-6">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                BOM Print Preview
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950">
                {detail.model.fg_name || detail.model.fg_sku}
              </h1>
              <div className="mt-2 text-sm text-neutral-600">{detail.model.fg_sku}</div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Version
                </div>
                <div className="mt-2 text-lg font-semibold text-neutral-950">
                  v{selectedVersion.version_no}
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Effective From
                </div>
                <div className="mt-2 text-lg font-semibold text-neutral-950">
                  {formatDate(selectedVersion.effective_from)}
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  BOM Lines
                </div>
                <div className="mt-2 text-lg font-semibold text-neutral-950">
                  {selectedVersion.lines.length}
                </div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Sales Qty
                </div>
                <div className="mt-2 text-lg font-semibold text-neutral-950">
                  {snapshot ? formatQuantity(snapshot.salesQty, 'pcs') : '—'}
                </div>
              </div>
            </div>

            {selectedVersion.notes ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {selectedVersion.notes}
              </div>
            ) : null}

            <div className="mt-6 overflow-hidden rounded-3xl border border-neutral-200">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-100 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Component SKU</th>
                    <th className="px-4 py-3 font-semibold">Component</th>
                    <th className="px-4 py-3 font-semibold">Qty / FG</th>
                    <th className="px-4 py-3 font-semibold">Unit</th>
                    <th className="px-4 py-3 font-semibold">Inward</th>
                    <th className="px-4 py-3 font-semibold">Selected Model</th>
                    <th className="px-4 py-3 font-semibold">All Models</th>
                    <th className="px-4 py-3 font-semibold">Balance</th>
                    <th className="px-4 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedVersion.lines.map((line) => {
                    const stock = stockByItemId.get(line.component_item_id);
                    return (
                      <tr key={line.id} className="border-t border-neutral-200 align-top">
                        <td className="px-4 py-3 font-medium text-neutral-700">
                          {line.component_sku}
                        </td>
                        <td className="px-4 py-3">{line.component_name}</td>
                        <td className="px-4 py-3 font-semibold">
                          {formatQuantity(line.qty_per_fg, line.unit)}
                        </td>
                        <td className="px-4 py-3">{line.unit || '—'}</td>
                        <td className="px-4 py-3">
                          {stock ? formatQuantity(stock.inwardQty, stock.unit) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {stock ? formatQuantity(stock.selectedModelConsumedQty, stock.unit) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {stock ? formatQuantity(stock.consumedQty, stock.unit) : '—'}
                        </td>
                        <td
                          className={`px-4 py-3 font-semibold ${
                            stock && stock.balanceQty < stock.reorderThresholdQty
                              ? 'text-rose-700'
                              : 'text-neutral-900'
                          }`}
                        >
                          {stock ? formatQuantity(stock.balanceQty, stock.unit) : '—'}
                        </td>
                        <td className="px-4 py-3 text-neutral-600">{line.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
