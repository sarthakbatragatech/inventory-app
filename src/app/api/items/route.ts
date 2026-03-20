import { NextRequest, NextResponse } from 'next/server';
import { deriveItemFamily } from '@/lib/item-family';
import { resolveItemFamilies } from '@/lib/item-family-links';
import { getSupabaseServerClient } from '@/lib/supabase';

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

type ImportRowRecord = {
  item_id: string;
  quantity: number | null;
  inward_date: string | null;
  unit: string | null;
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim().toLowerCase() || '';
  const familyFilter = searchParams.get('family')?.trim() || '';
  const categoryFilter = searchParams.get('category')?.trim() || '';

  const supabase = getSupabaseServerClient();

  const { data: batches, error: batchError } = await supabase
    .from('import_batches')
    .select('id, file_name, uploaded_at, status')
    .eq('status', 'processed')
    .order('uploaded_at', { ascending: false });

  if (batchError) {
    return NextResponse.json({ error: batchError.message }, { status: 500 });
  }

  const latestBatchIds = [
    ...new Map(
      ((batches ?? []) as BatchRecord[]).map((batch) => [batch.file_name, batch])
    ).values(),
  ].map((batch) => batch.id);

  if (!latestBatchIds.length) {
    return NextResponse.json({ items: [], familyOptions: [] });
  }

  let itemQuery = supabase
    .from('items')
    .select('id, sku, item_name, normalized_name, family, category, default_unit, created_at, active')
    .eq('active', true)
    .order('item_name', { ascending: true })
    .limit(500);

  if (q) {
    itemQuery = itemQuery.or(`sku.ilike.%${q}%,item_name.ilike.%${q}%`);
  }

  const { data: items, error: itemError } = await itemQuery;

  if (itemError) {
    console.error('Supabase query error:', itemError);
    if (
      itemError.code === '42703' ||
      itemError.code === '42P01' ||
      itemError.message.includes('does not exist') ||
      (itemError.message.includes('relation') && itemError.message.includes('does not exist'))
    ) {
      return NextResponse.json({ items: [], familyOptions: [], categoryOptions: [] });
    }

    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  const itemList = (items ?? []) as ItemRecord[];
  if (!itemList.length) {
      return NextResponse.json({ items: [], familyOptions: [], categoryOptions: [] });
  }

  const itemIds = itemList.map((item) => item.id);
  const importRows: ImportRowRecord[] = [];

  for (let index = 0; index < latestBatchIds.length; index += 100) {
    const batchChunk = latestBatchIds.slice(index, index + 100);
    const { data, error } = await supabase
      .from('import_batch_rows')
      .select('item_id, quantity, inward_date, unit')
      .in('batch_id', batchChunk)
      .in('item_id', itemIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    importRows.push(...((data ?? []) as ImportRowRecord[]));
  }

  const rowsByItemId = new Map<string, ImportRowRecord[]>();
  for (const row of importRows) {
    const existing = rowsByItemId.get(row.item_id) ?? [];
    existing.push(row);
    rowsByItemId.set(row.item_id, existing);
  }

  const enrichedItems = itemList
    .map((item) => {
      const rows = rowsByItemId.get(item.id) ?? [];
      const totalQty = rows.reduce((sum, row) => sum + (row.quantity || 0), 0);
      const rowUnits = [
        ...new Set(
          rows
            .map((row) => normalizeDisplayUnit(row.unit))
            .filter((unit): unit is string => Boolean(unit))
        ),
      ];
      const lastInward =
        rows
          .filter((row) => row.inward_date)
          .sort(
            (a, b) =>
              new Date(b.inward_date as string).getTime() -
              new Date(a.inward_date as string).getTime()
          )[0] ?? null;

      return {
        ...item,
        default_unit:
          rowUnits.length === 1
            ? rowUnits[0]
            : normalizeDisplayUnit(item.default_unit),
        totalQty,
        lastInward: lastInward?.inward_date ?? null,
        lastInwardQty: lastInward?.quantity ?? null,
        lastInwardUnit: normalizeDisplayUnit(lastInward?.unit ?? null),
        item_aliases: [],
      };
    })
    .filter((item) => item.totalQty > 0);

  const { familyByItemId } = await resolveItemFamilies(enrichedItems);

  const itemsWithFamilies = enrichedItems.map((item) => {
    const families = familyByItemId.get(item.id) ?? [];
    const fallbackFamily = item.family || deriveItemFamily(item.item_name, item.sku);

    return {
      ...item,
      family: families[0] || fallbackFamily,
      families: families.length ? families : fallbackFamily ? [fallbackFamily] : [],
    };
  });

  const familyOptions = [
    ...new Set(
      itemsWithFamilies
        .flatMap((item) => item.families)
        .filter((family): family is string => Boolean(family))
    ),
  ].sort((a, b) => a.localeCompare(b));

  const categoryOptions = [
    ...new Set(
      enrichedItems
        .map((item) => item.category)
        .filter((category): category is string => Boolean(category))
    ),
  ].sort((a, b) => a.localeCompare(b));

  const filteredItems = itemsWithFamilies.filter((item) => {
    if (familyFilter && !item.families.includes(familyFilter)) {
      return false;
    }

    if (categoryFilter && item.category !== categoryFilter) {
      return false;
    }

    return true;
  });

  return NextResponse.json({
    items: filteredItems,
    familyOptions,
    categoryOptions,
  });
}
