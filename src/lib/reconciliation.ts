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

type AdjustmentRecord = {
  id: string;
  item_id: string;
  adjustment_date: string;
  quantity_delta: number;
  reason: string;
  reference_model: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ReconciliationSavedItem = {
  itemId: string;
  sku: string;
  itemName: string;
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

export type ReconciliationAdjustmentListItem = {
  id: string;
  itemId: string;
  sku: string;
  itemName: string;
  family: string | null;
  families: string[];
  category: string | null;
  default_unit: string | null;
  adjustmentDate: string;
  quantityDelta: number;
  reason: string;
  referenceModel: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
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
  const itemsById = new Map(itemList.map((item) => [item.id, item]));
  const itemIds = itemList.map((item) => item.id);
  const reconciliationByItemId = new Map<string, ReconciliationRecord>();
  let adjustmentRows: AdjustmentRecord[] = [];

  if (itemIds.length > 0) {
    const [
      { data: reconciliations, error: reconciliationError },
      { data: adjustments, error: adjustmentError },
    ] = await Promise.all([
      supabase
        .from('stock_reconciliations')
        .select('item_id, physical_qty, notes')
        .eq('count_date', params.date)
        .in('item_id', itemIds),
      supabase
        .from('stock_adjustments')
        .select(
          'id, item_id, adjustment_date, quantity_delta, reason, reference_model, notes, created_at, updated_at'
        )
        .eq('adjustment_date', params.date)
        .in('item_id', itemIds)
        .order('created_at', { ascending: false }),
    ]);

    if (reconciliationError) {
      throw new Error(`Failed to load reconciliations: ${reconciliationError.message}`);
    }

    if (
      adjustmentError &&
      !['PGRST205', '42P01'].includes(adjustmentError.code || '') &&
      !adjustmentError.message.includes('does not exist')
    ) {
      throw new Error(`Failed to load stock adjustments: ${adjustmentError.message}`);
    }

    for (const row of (reconciliations ?? []) as ReconciliationRecord[]) {
      reconciliationByItemId.set(row.item_id, row);
    }

    adjustmentRows = (adjustments ?? []) as AdjustmentRecord[];
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

  const adjustments = adjustmentRows
    .map((row) => {
      const item = itemsById.get(row.item_id);
      if (!item) {
        return null;
      }

      const families = familyByItemId.get(item.id) ?? [];
      const fallbackFamily = item.family || deriveItemFamily(item.item_name, item.sku);
      const resolvedFamilies = families.length
        ? families
        : fallbackFamily
          ? [fallbackFamily]
          : [];
      const stockItem = stockByItemId.get(item.id);

      return {
        id: row.id,
        itemId: item.id,
        sku: item.sku,
        itemName: item.item_name,
        family: resolvedFamilies[0] || fallbackFamily,
        families: resolvedFamilies,
        category: item.category,
        default_unit: normalizeDisplayUnit(stockItem?.default_unit ?? item.default_unit),
        adjustmentDate: row.adjustment_date,
        quantityDelta: Number(row.quantity_delta ?? 0),
        reason: row.reason,
        referenceModel: row.reference_model,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      } satisfies ReconciliationAdjustmentListItem;
    })
    .filter((value): value is ReconciliationAdjustmentListItem => Boolean(value))
    .filter((item) => {
      if (familyFilter && !item.families.includes(familyFilter)) {
        return false;
      }

      if (categoryFilter && item.category !== categoryFilter) {
        return false;
      }

      return true;
    });

  return {
    items: filteredItems,
    familyOptions,
    categoryOptions,
    adjustments,
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
  const involvedItemIds = [...new Set(counts.map((row) => row.itemId))];
  let savedItems: ReconciliationSavedItem[] = [];
  let clearedItems: ReconciliationSavedItem[] = [];

  if (involvedItemIds.length > 0) {
    const { data: items, error: itemError } = await supabase
      .from('items')
      .select('id, sku, item_name')
      .in('id', involvedItemIds);

    if (itemError) {
      throw new Error(`Failed to load reconciliation item metadata: ${itemError.message}`);
    }

    const itemById = new Map(
      ((items ?? []) as Array<{ id: string; sku: string; item_name: string }>).map((item) => [
        item.id,
        {
          itemId: item.id,
          sku: item.sku,
          itemName: item.item_name,
        } satisfies ReconciliationSavedItem,
      ])
    );

    savedItems = rowsToUpsert.map((row) => itemById.get(row.itemId)).filter(Boolean) as ReconciliationSavedItem[];
    clearedItems = itemIdsToDelete
      .map((itemId) => itemById.get(itemId))
      .filter(Boolean) as ReconciliationSavedItem[];
  }

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
    savedItems,
    clearedItems,
  };
}

export async function createStockAdjustment(input: {
  date: string;
  itemId: string;
  quantityDelta: number;
  reason: string;
  referenceModel: string | null;
  notes: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const { data: item, error: itemError } = await supabase
    .from('items')
    .select('id, sku, item_name, active')
    .eq('id', input.itemId)
    .eq('active', true)
    .maybeSingle();

  if (itemError) {
    throw new Error(`Failed to load adjustment item: ${itemError.message}`);
  }

  if (!item) {
    throw new Error('Selected SKU was not found.');
  }

  const { data: adjustment, error: adjustmentError } = await supabase
    .from('stock_adjustments')
    .insert({
      item_id: input.itemId,
      adjustment_date: input.date,
      quantity_delta: input.quantityDelta,
      reason: input.reason,
      reference_model: input.referenceModel,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    })
    .select('id, adjustment_date, quantity_delta, reason, reference_model, notes, created_at, updated_at')
    .single();

  if (adjustmentError) {
    throw new Error(`Failed to save stock adjustment: ${adjustmentError.message}`);
  }

  return {
    item: {
      itemId: String(item.id),
      sku: String(item.sku),
      itemName: String(item.item_name),
    } satisfies ReconciliationSavedItem,
    adjustment: {
      id: String(adjustment.id),
      adjustmentDate: String(adjustment.adjustment_date),
      quantityDelta: Number(adjustment.quantity_delta ?? 0),
      reason: String(adjustment.reason),
      referenceModel:
        adjustment.reference_model === null ? null : String(adjustment.reference_model),
      notes: adjustment.notes === null ? null : String(adjustment.notes),
      createdAt: String(adjustment.created_at),
      updatedAt: String(adjustment.updated_at),
    },
  };
}

export async function deleteStockAdjustment(adjustmentId: string) {
  const supabase = getSupabaseServerClient();
  const { data: adjustment, error: lookupError } = await supabase
    .from('stock_adjustments')
    .select('id, item_id, quantity_delta, items!inner(id, sku, item_name)')
    .eq('id', adjustmentId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Failed to load stock adjustment: ${lookupError.message}`);
  }

  if (!adjustment) {
    throw new Error('Stock adjustment not found.');
  }

  const { error: deleteError } = await supabase
    .from('stock_adjustments')
    .delete()
    .eq('id', adjustmentId);

  if (deleteError) {
    throw new Error(`Failed to delete stock adjustment: ${deleteError.message}`);
  }

  const item = Array.isArray(adjustment.items) ? adjustment.items[0] : adjustment.items;

  return {
    item: item
      ? {
          itemId: String(item.id),
          sku: String(item.sku),
          itemName: String(item.item_name),
        }
      : null,
    quantityDelta: Number(adjustment.quantity_delta ?? 0),
  };
}
