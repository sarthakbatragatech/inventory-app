import { BomManager } from '@/components/bom/bom-manager';
import {
  listBomCatalogItems,
  listBomModels,
  listComponentItems,
} from '@/lib/bom';

export const dynamic = 'force-dynamic';

export default async function BomPage() {
  const [catalogItems, bomModels, componentItems] = await Promise.all([
    listBomCatalogItems(),
    listBomModels(),
    listComponentItems(),
  ]);

  const catalogBySku = new Map(catalogItems.map((item) => [item.fg_sku, item]));

  for (const model of bomModels) {
    if (!catalogBySku.has(model.fg_sku)) {
      catalogBySku.set(model.fg_sku, {
        fg_sku: model.fg_sku,
        fg_name: model.fg_name,
        source_item_id: model.source_item_id,
      });
    }
  }

  const catalogOptions = [...catalogBySku.values()].sort((left, right) =>
    left.fg_sku.localeCompare(right.fg_sku)
  );
  const initialFgSku = bomModels[0]?.fg_sku ?? catalogOptions[0]?.fg_sku ?? '';
  const catalogCount = catalogOptions.length;
  const modelCount = bomModels.length;
  const componentCount = componentItems.length;

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-6 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 overflow-hidden rounded-[2rem] border border-neutral-200 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] shadow-sm">
          <div className="grid gap-4 p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)] lg:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                BOM Workspace
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
                BOM Management
              </h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <div className="rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Sales Models
                </div>
                <div className="mt-1 text-2xl font-semibold text-neutral-950">{catalogCount}</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  BOM Models
                </div>
                <div className="mt-1 text-2xl font-semibold text-neutral-950">{modelCount}</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Components
                </div>
                <div className="mt-1 text-2xl font-semibold text-neutral-950">{componentCount}</div>
              </div>
            </div>
          </div>
        </div>

        <BomManager
          catalogOptions={catalogOptions}
          componentOptions={componentItems}
          initialFgSku={initialFgSku}
        />
      </div>
    </div>
  );
}
