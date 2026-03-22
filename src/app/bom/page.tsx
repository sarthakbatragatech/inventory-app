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

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-6 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">
            BOM Management
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-700">
            Define model BOMs version by version. Finished-good SKUs come from synced
            sales data, while component lines point to your local inventory SKUs so you
            can derive consumption from outward sales later.
          </p>
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
