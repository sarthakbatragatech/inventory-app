import { deriveItemFamily } from '@/lib/item-family';
import { resolveItemFamilies } from '@/lib/item-family-links';
import { getStockListItems } from '@/lib/stock';
import { getSupabaseServerClient } from '@/lib/supabase';

type ItemRecord = {
  id: string;
  sku: string;
  item_name: string;
  family: string | null;
  category: string | null;
  default_unit: string | null;
  created_at: string;
  active: boolean;
};

type ReconciliationRecord = {
  item_id: string;
  physical_qty: number;
  notes: string | null;
};

export type ReconciliationListItem = {
  id: string;
  sku: string;
  item_name: string;
  family: string | null;
  families: string[];
  category: string | null;
  default_unit: string | null;
  balanceQty: number;
  physicalQty: number | null;
  notes: string | null;
  varianceQty: number | null;
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

export async function listReconciliationItems(params: {
  date: string;
  q?: string;
  family?: string;
  category?: string;
}) {
  const q = params.q?.trim().toLowerCase() || '';
  const familyFilter = params.family?.trim() || '';
  const categoryFilter = params.category?.trim() || '';
  const supabase = getSupabaseServerClient();

  let itemQuery = supabase
    .from('items')
    .select('id, sku, item_name, family, category, default_unit, created_at, active')
    .eq('active', true)
    .order('item_name', { ascending: true })
    .limit(2000);

  if (q) {
    itemQuery = itemQuery.or(`sku.ilike.%${q}%,item_name.ilike.%${q}%`);
  }

  const [{ data: items, error: itemError }, stockItems] = await Promise.all([
    itemQuery,
    getStockListItems(),
  ]);

  if (itemError) {
    throw new Error(`Failed to load items for reconciliation: ${itemError.message}`);
  }

  const itemList = (items ?? []) as ItemRecord[];
  const { familyByItemId } = await resolveItemFamilies(
    itemList.map((item) => ({
      id: item.id,
      item_name: item.item_name,
      sku: item.sku,
      family: item.family,
    }))
  );

  const stockByItemId = new Map(stockItems.map((item) => [item.id, item]));
  const itemIds = itemList.map((item) => item.id);
  const reconciliationByItemId = new Map<string, ReconciliationRecord>();

  if (itemIds.length > 0) {
    const { data: reconciliations, error: reconciliationError } = await supabase
      .from('stock_reconciliations')
      .select('item_id, physical_qty, notes')
      .eq('count_date', params.date)
      .in('item_id', itemIds);

    if (reconciliationError) {
      throw new Error(`Failed to load reconciliations: ${reconciliationError.message}`);
    }

    for (const row of (reconciliations ?? []) as ReconciliationRecord[]) {
      reconciliationByItemId.set(row.item_id, row);
    }
  }

  const enrichedItems = itemList.map((item) => {
    const families = familyByItemId.get(item.id) ?? [];
    const fallbackFamily = item.family || deriveItemFamily(item.item_name, item.sku);
    const resolvedFamilies = families.length
      ? families
      : fallbackFamily
        ? [fallbackFamily]
        : [];
    const stockItem = stockByItemId.get(item.id);
    const reconciliation = reconciliationByItemId.get(item.id) ?? null;
    const balanceQty = stockItem?.balanceQty ?? 0;
    const physicalQty = reconciliation?.physical_qty ?? null;

    return {
      id: item.id,
      sku: item.sku,
      item_name: item.item_name,
      family: resolvedFamilies[0] || fallbackFamily,
      families: resolvedFamilies,
      category: item.category,
      default_unit: normalizeDisplayUnit(stockItem?.default_unit ?? item.default_unit),
      balanceQty,
      physicalQty,
      notes: reconciliation?.notes ?? null,
      varianceQty: physicalQty === null ? null : physicalQty - balanceQty,
    } satisfies ReconciliationListItem;
  });

  const filteredItems = enrichedItems.filter((item) => {
    if (familyFilter && !item.families.includes(familyFilter)) {
      return false;
    }

    if (categoryFilter && item.category !== categoryFilter) {
      return false;
    }

    return true;
  });

  const familyOptions = [
    ...new Set(
      enrichedItems
        .flatMap((item) => item.families)
        .filter((family): family is string => Boolean(family))
    ),
  ].sort((left, right) => left.localeCompare(right));

  const categoryOptions = [
    ...new Set(
      enrichedItems
        .map((item) => item.category)
        .filter((category): category is string => Boolean(category))
    ),
  ].sort((left, right) => left.localeCompare(right));

  return {
    items: filteredItems,
    familyOptions,
    categoryOptions,
  };
}

export async function saveReconciliationCounts(
  date: string,
  counts: Array<{
    itemId: string;
    physicalQty: number | null;
    notes: string | null;
  }>
) {
  const supabase = getSupabaseServerClient();
  const rowsToUpsert = counts.filter((row) => row.physicalQty !== null);
  const itemIdsToDelete = counts
    .filter((row) => row.physicalQty === null)
    .map((row) => row.itemId);

  if (itemIdsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('stock_reconciliations')
      .delete()
      .eq('count_date', date)
      .in('item_id', itemIdsToDelete);

    if (deleteError) {
      throw new Error(`Failed to clear reconciliations: ${deleteError.message}`);
    }
  }

  if (rowsToUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from('stock_reconciliations')
      .upsert(
        rowsToUpsert.map((row) => ({
          item_id: row.itemId,
          count_date: date,
          physical_qty: row.physicalQty,
          notes: row.notes,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'item_id,count_date' }
      );

    if (upsertError) {
      throw new Error(`Failed to save reconciliations: ${upsertError.message}`);
    }
  }

  return {
    savedCount: rowsToUpsert.length,
    clearedCount: itemIdsToDelete.length,
  };
}
