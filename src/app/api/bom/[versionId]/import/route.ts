import { NextResponse } from 'next/server';
import { parseBomCsv } from '@/lib/bom-csv';
import { getBomVersionById, saveBomVersion } from '@/lib/bom';
import { getSupabaseInventoryServerClient } from '@/lib/supabase';

type InventoryItemRow = {
  id: string;
  sku: string;
  item_name: string;
  default_unit: string | null;
};

export async function POST(
  request: Request,
  context: RouteContext<'/api/bom/[versionId]/import'>
) {
  const { versionId } = await context.params;

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Attach a CSV file to import.' }, { status: 400 });
    }

    const csvText = await file.text();
    const rows = parseBomCsv(csvText);
    const versionLookup = await getBomVersionById(versionId);
    const componentSkus = rows.map((row) => row.componentSku);
    const supabase = getSupabaseInventoryServerClient();

    const { data: items, error: itemError } = await supabase
      .from('items')
      .select('id, sku, item_name, default_unit')
      .in('sku', componentSkus);

    if (itemError) {
      return NextResponse.json({ error: itemError.message }, { status: 500 });
    }

    const itemsBySku = new Map(
      ((items ?? []) as InventoryItemRow[]).map((item) => [item.sku.trim().toUpperCase(), item])
    );

    const missingSkus = componentSkus.filter((componentSku) => !itemsBySku.has(componentSku));
    if (missingSkus.length > 0) {
      return NextResponse.json(
        {
          error: `These component SKUs do not exist in inventory: ${[
            ...new Set(missingSkus),
          ].join(', ')}`,
        },
        { status: 400 }
      );
    }

    const result = await saveBomVersion(versionId, {
      effectiveFrom: versionLookup.version.effective_from,
      notes: versionLookup.version.notes,
      lines: rows.map((row) => {
        const item = itemsBySku.get(row.componentSku);
        if (!item) {
          throw new Error(`These component SKUs do not exist in inventory: ${row.componentSku}`);
        }

        return {
          componentItemId: item.id,
          componentSku: item.sku,
          componentName: row.componentName || item.item_name,
          qtyPerFg: row.qtyPerFg,
          unit: row.unit || item.default_unit || null,
          notes: row.notes,
        };
      }),
    });

    return NextResponse.json({
      ok: true,
      importedLineCount: rows.length,
      fgSku: versionLookup.model.fg_sku,
      detail: result.detail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown BOM import error';
    const status = /csv|component sku|qty_per_fg|required|inventory/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
