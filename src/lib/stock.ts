import { getBomDetailBySku, listBomModels } from '@/lib/bom';
import { selectNewestBatchPerFileName } from '@/lib/import-batches';
import { deriveItemFamily } from '@/lib/item-family';
import { resolveItemFamilies } from '@/lib/item-family-links';
import { listOrderPortalPendingOrders } from '@/lib/order-pending';
import { getSupabaseInventoryServerClient } from '@/lib/supabase';

export type StockComponentRow = {
  componentItemId: string;
  componentSku: string;
  componentName: string;
  unit: string | null;
  inwardQty: number;
  selectedModelConsumedQty: number;
  selectedPendingOrderQty: number;
  consumedQty: number;
  reorderThresholdQty: number;
  pendingOrderReorderQty: number;
  balanceQty: number;
};

export type StockModelSnapshot = {
  fgSku: string;
  fgName: string | null;
  isAggregate: boolean;
  salesQty: number;
  salesDateFrom: string | null;
  salesDateTo: string | null;
  components: StockComponentRow[];
};

export type StockListItem = {
  id: string;
  sku: string;
  item_name: string;
  family: string | null;
  families: string[];
  category: string | null;
  default_unit: string | null;
  created_at: string;
  inwardQty: number;
  consumedQty: number;
  reorderThresholdQty: number;
  pendingOrderQty: number;
  pendingOrderReorderQty: number;
  balanceQty: number;
  lastInward: string | null;
  lastInwardQty: number | null;
  lastInwardUnit: string | null;
};

export type StockListFilters = {
  q?: string;
  family?: string;
  category?: string;
};

type SalesRow = {
  fg_sku: string;
  sale_date: string;
  qty: number;
};

type InwardRow = {
  item_id: string;
  quantity: number | null;
  inward_date?: string | null;
  unit?: string | null;
  batch_id?: string;
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
  family: string | null;
  category: string | null;
  default_unit: string | null;
  created_at: string;
  active: boolean;
};

type ComponentUsage = {
  componentItemId: string;
  componentSku: string;
  componentName: string;
  unit: string | null;
  consumedQty: number;
};

type ReconciliationRow = {
  item_id: string;
  count_date: string;
  physical_qty: number;
};

type StockAdjustmentRow = {
  item_id: string;
  adjustment_date: string;
  quantity_delta: number;
};

function normalizeDisplayUnit(unit: string | null) {
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

function compareEffectiveFromAsc(
  left: { effective_from: string },
  right: { effective_from: string }
) {
  return left.effective_from.localeCompare(right.effective_from);
}

function pickBomVersionForDate<
  TVersion extends { effective_from: string; lines: Array<unknown> }
>(versions: TVersion[], saleDate: string) {
  let selected: TVersion | null = null;

  for (const version of [...versions].sort(compareEffectiveFromAsc)) {
    if (version.effective_from <= saleDate) {
      selected = version;
    }
  }

  return selected;
}

function getMonthSpanInclusive(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) {
    return 1;
  }

  const [startYear, startMonth] = startDate.split('-').map(Number);
  const [endYear, endMonth] = endDate.split('-').map(Number);

  if (
    !Number.isFinite(startYear) ||
    !Number.isFinite(startMonth) ||
    !Number.isFinite(endYear) ||
    !Number.isFinite(endMonth)
  ) {
    return 1;
  }

  const months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
  return Math.max(months, 1);
}

async function loadLatestReconciliationByItemIds(
  supabase: ReturnType<typeof getSupabaseInventoryServerClient>,
  itemIds: string[]
) {
  if (!itemIds.length) {
    return new Map<string, ReconciliationRow>();
  }

  const { data: reconciliations, error: reconciliationError } = await supabase
    .from('stock_reconciliations')
    .select('item_id, count_date, physical_qty')
    .in('item_id', itemIds)
    .order('count_date', { ascending: false });

  if (reconciliationError) {
    throw new Error(`Failed to load stock reconciliations: ${reconciliationError.message}`);
  }

  return ((reconciliations ?? []) as ReconciliationRow[]).reduce((map, row) => {
    if (!map.has(row.item_id)) {
      map.set(row.item_id, row);
    }

    return map;
  }, new Map<string, ReconciliationRow>());
}

async function loadStockAdjustmentsByItemIds(
  supabase: ReturnType<typeof getSupabaseInventoryServerClient>,
  itemIds: string[]
) {
  if (!itemIds.length) {
    return new Map<string, StockAdjustmentRow[]>();
  }

  const { data: adjustments, error: adjustmentError } = await supabase
    .from('stock_adjustments')
    .select('item_id, adjustment_date, quantity_delta')
    .in('item_id', itemIds)
    .order('adjustment_date', { ascending: true });

  if (
    adjustmentError &&
    !['PGRST205', '42P01'].includes(adjustmentError.code || '') &&
    !adjustmentError.message.includes('does not exist')
  ) {
    throw new Error(`Failed to load stock adjustments: ${adjustmentError.message}`);
  }

  return ((adjustments ?? []) as StockAdjustmentRow[]).reduce((map, row) => {
    const existing = map.get(row.item_id) ?? [];
    existing.push(row);
    map.set(row.item_id, existing);
    return map;
  }, new Map<string, StockAdjustmentRow[]>());
}

export async function listStockModels() {
  return listBomModels();
}

async function loadComponentConsumption() {
  const supabase = getSupabaseInventoryServerClient();
  const bomModels = await listBomModels();
  const bomDetails = (
    await Promise.all(bomModels.map((model) => getBomDetailBySku(model.fg_sku)))
  ).filter((value): value is NonNullable<typeof value> => Boolean(value));

  const fgSkus = bomDetails.map((modelDetail) => modelDetail.model.fg_sku);
  const { data: salesRows, error: salesError } = await supabase
    .from('daily_fg_sales_import')
    .select('fg_sku, sale_date, qty')
    .in('fg_sku', fgSkus)
    .order('sale_date', { ascending: true });

  if (salesError) {
    throw new Error(`Failed to load model sales: ${salesError.message}`);
  }

  const typedSalesRows = (salesRows ?? []) as SalesRow[];
  const salesByFgSku = typedSalesRows.reduce((map, row) => {
    const existing = map.get(row.fg_sku) ?? [];
    existing.push({ sale_date: row.sale_date, qty: row.qty });
    map.set(row.fg_sku, existing);
    return map;
  }, new Map<string, Array<{ sale_date: string; qty: number }>>());

  const globalComponentUsage = new Map<
    string,
    {
      componentItemId: string;
      componentSku: string;
      componentName: string;
      unit: string | null;
      consumedQty: number;
    }
  >();
  const globalComponentUsageByDate = new Map<string, Map<string, number>>();

  const selectedComponentUsageByFgSku = new Map<
    string,
    Map<
      string,
      {
        componentItemId: string;
        componentSku: string;
        componentName: string;
        unit: string | null;
        consumedQty: number;
      }
    >
  >();

  for (const modelDetail of bomDetails) {
    const modelSalesRows = salesByFgSku.get(modelDetail.model.fg_sku) ?? [];

    for (const saleRow of modelSalesRows) {
      const version = pickBomVersionForDate(modelDetail.versions, saleRow.sale_date);
      if (!version) {
        continue;
      }

      for (const line of version.lines) {
        const qtyToAdd = saleRow.qty * line.qty_per_fg;

        const globalExisting = globalComponentUsage.get(line.component_item_id) ?? {
          componentItemId: line.component_item_id,
          componentSku: line.component_sku,
          componentName: line.component_name,
          unit: line.unit,
          consumedQty: 0,
        };

        globalExisting.consumedQty += qtyToAdd;
        globalComponentUsage.set(line.component_item_id, globalExisting);

        const usageByDate = globalComponentUsageByDate.get(line.component_item_id) ?? new Map();
        usageByDate.set(saleRow.sale_date, (usageByDate.get(saleRow.sale_date) ?? 0) + qtyToAdd);
        globalComponentUsageByDate.set(line.component_item_id, usageByDate);

        const selectedMap =
          selectedComponentUsageByFgSku.get(modelDetail.model.fg_sku) ?? new Map();
        const selectedExisting = selectedMap.get(line.component_item_id) ?? {
          componentItemId: line.component_item_id,
          componentSku: line.component_sku,
          componentName: line.component_name,
          unit: line.unit,
          consumedQty: 0,
        };

        selectedExisting.consumedQty += qtyToAdd;
        selectedMap.set(line.component_item_id, selectedExisting);
        selectedComponentUsageByFgSku.set(modelDetail.model.fg_sku, selectedMap);
      }
    }
  }

  const globalSalesDateFrom = typedSalesRows[0]?.sale_date ?? null;
  const globalSalesDateTo = typedSalesRows[typedSalesRows.length - 1]?.sale_date ?? null;
  const monthSpan = getMonthSpanInclusive(globalSalesDateFrom, globalSalesDateTo);

  return {
    bomDetails,
    salesByFgSku,
    globalComponentUsage,
    globalComponentUsageByDate,
    selectedComponentUsageByFgSku,
    globalSalesDateFrom,
    globalSalesDateTo,
    monthSpan,
  };
}

function calculateBalancedQtyFromLatestReconciliation(input: {
  inwardRows: InwardRow[];
  totalConsumedQty: number;
  consumedByDate: Map<string, number> | undefined;
  adjustmentRows: StockAdjustmentRow[];
  latestReconciliation: ReconciliationRow | undefined;
}) {
  const latestReconciliation = input.latestReconciliation;
  const totalAdjustmentQty = input.adjustmentRows.reduce(
    (sum, row) => sum + Number(row.quantity_delta ?? 0),
    0
  );

  if (!latestReconciliation) {
    return (
      input.inwardRows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0) +
      totalAdjustmentQty -
      input.totalConsumedQty
    );
  }

  const inwardAfterCountQty = input.inwardRows.reduce((sum, row) => {
    if (!row.inward_date || row.inward_date <= latestReconciliation.count_date) {
      return sum;
    }

    return sum + Number(row.quantity ?? 0);
  }, 0);

  const consumedAfterCountQty = [...(input.consumedByDate?.entries() ?? [])].reduce(
    (sum, [saleDate, qty]) => (saleDate > latestReconciliation.count_date ? sum + qty : sum),
    0
  );

  const adjustmentsAfterCountQty = input.adjustmentRows.reduce((sum, row) => {
    if (row.adjustment_date <= latestReconciliation.count_date) {
      return sum;
    }

    return sum + Number(row.quantity_delta ?? 0);
  }, 0);

  return (
    latestReconciliation.physical_qty +
    inwardAfterCountQty +
    adjustmentsAfterCountQty -
    consumedAfterCountQty
  );
}

async function buildStockSnapshot(input: {
  fgSku: string;
  fgName: string | null;
  isAggregate: boolean;
  selectedComponentUsage: Map<string, ComponentUsage>;
  selectedPendingComponentUsage: Map<string, ComponentUsage>;
  selectedSalesRows: Array<{ sale_date: string; qty: number }>;
  globalComponentUsage: Map<string, ComponentUsage>;
  globalComponentUsageByDate: Map<string, Map<string, number>>;
  monthSpan: number;
}) {
  const supabase = getSupabaseInventoryServerClient();
  const componentItemIds = [...input.selectedComponentUsage.keys()];
  const inwardTotals = new Map<string, number>();
  const inwardRowsByItemId = new Map<string, InwardRow[]>();
  const [latestReconciliationByItemId, stockAdjustmentsByItemId] = await Promise.all([
    loadLatestReconciliationByItemIds(supabase, componentItemIds),
    loadStockAdjustmentsByItemIds(supabase, componentItemIds),
  ]);

  if (componentItemIds.length > 0) {
    const { data: inwardRows, error: inwardError } = await supabase
      .from('import_batch_rows')
      .select('item_id, quantity, inward_date')
      .in('item_id', componentItemIds);

    if (inwardError) {
      throw new Error(`Failed to load component inward rows: ${inwardError.message}`);
    }

    for (const row of (inwardRows ?? []) as InwardRow[]) {
      const existing = inwardTotals.get(row.item_id) ?? 0;
      inwardTotals.set(row.item_id, existing + Number(row.quantity ?? 0));
      const existingRows = inwardRowsByItemId.get(row.item_id) ?? [];
      existingRows.push(row);
      inwardRowsByItemId.set(row.item_id, existingRows);
    }
  }

  const components: StockComponentRow[] = [...input.selectedComponentUsage.values()]
    .map((component) => {
      const inwardQty = inwardTotals.get(component.componentItemId) ?? 0;
      const selectedModelConsumedQty = component.consumedQty;
      const selectedPendingOrderQty =
        input.selectedPendingComponentUsage.get(component.componentItemId)?.consumedQty ?? 0;
      const consumedQty =
        input.globalComponentUsage.get(component.componentItemId)?.consumedQty ?? 0;
      const reorderThresholdQty = consumedQty / input.monthSpan;
      const balanceQty = calculateBalancedQtyFromLatestReconciliation({
        inwardRows: inwardRowsByItemId.get(component.componentItemId) ?? [],
        totalConsumedQty: consumedQty,
        consumedByDate: input.globalComponentUsageByDate.get(component.componentItemId),
        adjustmentRows: stockAdjustmentsByItemId.get(component.componentItemId) ?? [],
        latestReconciliation: latestReconciliationByItemId.get(component.componentItemId),
      });

      return {
        componentItemId: component.componentItemId,
        componentSku: component.componentSku,
        componentName: component.componentName,
        unit: component.unit,
        inwardQty,
        selectedModelConsumedQty,
        selectedPendingOrderQty,
        consumedQty,
        reorderThresholdQty,
        pendingOrderReorderQty: Math.max(selectedPendingOrderQty - balanceQty, 0),
        balanceQty,
      };
    })
    .sort((left, right) => {
      if (left.balanceQty !== right.balanceQty) {
        return left.balanceQty - right.balanceQty;
      }

      return left.componentSku.localeCompare(right.componentSku);
    });

  const sortedSalesRows = [...input.selectedSalesRows].sort((left, right) =>
    left.sale_date.localeCompare(right.sale_date)
  );

  return {
    fgSku: input.fgSku,
    fgName: input.fgName,
    isAggregate: input.isAggregate,
    salesQty: sortedSalesRows.reduce((sum, row) => sum + row.qty, 0),
    salesDateFrom: sortedSalesRows[0]?.sale_date ?? null,
    salesDateTo: sortedSalesRows[sortedSalesRows.length - 1]?.sale_date ?? null,
    components,
  } satisfies StockModelSnapshot;
}

async function loadPendingComponentDemand(
  bomDetails: Awaited<ReturnType<typeof loadComponentConsumption>>['bomDetails']
) {
  try {
    const pendingRows = await listOrderPortalPendingOrders();
    const bomBySku = new Map(bomDetails.map((detail) => [detail.model.fg_sku, detail]));
    const globalPendingComponentUsage = new Map<string, ComponentUsage>();
    const selectedPendingComponentUsageByFgSku = new Map<
      string,
      Map<string, ComponentUsage>
    >();

    for (const row of pendingRows) {
      const detail = bomBySku.get(row.model_key);
      if (!detail) {
        continue;
      }

      const version = pickBomVersionForDate(detail.versions, row.reference_date);
      if (!version) {
        continue;
      }

      for (const line of version.lines) {
        const qtyToAdd = row.qty * line.qty_per_fg;
        const globalExisting = globalPendingComponentUsage.get(line.component_item_id) ?? {
          componentItemId: line.component_item_id,
          componentSku: line.component_sku,
          componentName: line.component_name,
          unit: line.unit,
          consumedQty: 0,
        };

        globalExisting.consumedQty += qtyToAdd;
        globalPendingComponentUsage.set(line.component_item_id, globalExisting);

        const selectedMap =
          selectedPendingComponentUsageByFgSku.get(detail.model.fg_sku) ?? new Map();
        const selectedExisting = selectedMap.get(line.component_item_id) ?? {
          componentItemId: line.component_item_id,
          componentSku: line.component_sku,
          componentName: line.component_name,
          unit: line.unit,
          consumedQty: 0,
        };

        selectedExisting.consumedQty += qtyToAdd;
        selectedMap.set(line.component_item_id, selectedExisting);
        selectedPendingComponentUsageByFgSku.set(detail.model.fg_sku, selectedMap);
      }
    }

    return {
      globalPendingComponentUsage,
      selectedPendingComponentUsageByFgSku,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown pending order demand error';
    console.error('Failed to load pending order demand for stock:', message);
    return {
      globalPendingComponentUsage: new Map<string, ComponentUsage>(),
      selectedPendingComponentUsageByFgSku: new Map<string, Map<string, ComponentUsage>>(),
    };
  }
}

export async function getStockListItems() {
  const supabase = getSupabaseInventoryServerClient();
  const [
    { bomDetails, globalComponentUsage, globalComponentUsageByDate, monthSpan },
    { data: batches, error: batchError },
    { data: items, error: itemError },
  ] = await Promise.all([
    loadComponentConsumption(),
    supabase
      .from('import_batches')
      .select('id, file_name, uploaded_at, status')
      .eq('status', 'processed')
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('items')
      .select('id, sku, item_name, family, category, default_unit, created_at, active')
      .eq('active', true)
      .order('item_name', { ascending: true })
      .limit(2000),
  ]);

  if (batchError) {
    throw new Error(`Failed to load import batches: ${batchError.message}`);
  }

  if (itemError) {
    throw new Error(`Failed to load inventory items: ${itemError.message}`);
  }

  const latestBatchIds = selectNewestBatchPerFileName(
    (batches ?? []) as BatchRecord[]
  ).map((batch) => batch.id);

  const itemList = (items ?? []) as ItemRecord[];
  const allItemIds = new Set(itemList.map((item) => item.id));
  for (const componentItemId of globalComponentUsage.keys()) {
    allItemIds.add(componentItemId);
  }

  const { globalPendingComponentUsage } = await loadPendingComponentDemand(bomDetails);
  for (const componentItemId of globalPendingComponentUsage.keys()) {
    allItemIds.add(componentItemId);
  }

  const inwardRows: InwardRow[] = [];
  const itemIds = [...allItemIds];
  const [latestReconciliationByItemId, stockAdjustmentsByItemId] = await Promise.all([
    loadLatestReconciliationByItemIds(supabase, itemIds),
    loadStockAdjustmentsByItemIds(supabase, itemIds),
  ]);

  for (let index = 0; index < latestBatchIds.length; index += 100) {
    const batchChunk = latestBatchIds.slice(index, index + 100);
    if (!batchChunk.length || !itemIds.length) {
      continue;
    }

    const { data, error } = await supabase
      .from('import_batch_rows')
      .select('item_id, quantity, inward_date, unit, batch_id')
      .in('batch_id', batchChunk)
      .in('item_id', itemIds);

    if (error) {
      throw new Error(`Failed to load inward rows: ${error.message}`);
    }

    inwardRows.push(...((data ?? []) as InwardRow[]));
  }

  const rowsByItemId = new Map<string, InwardRow[]>();
  for (const row of inwardRows) {
    const existing = rowsByItemId.get(row.item_id) ?? [];
    existing.push(row);
    rowsByItemId.set(row.item_id, existing);
  }

  const itemsById = new Map(itemList.map((item) => [item.id, item]));
  const stockItems = itemIds
    .map((itemId) => {
      const item = itemsById.get(itemId);
      const rows = rowsByItemId.get(itemId) ?? [];
      const inwardQty = rows.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
      const lastInward =
        rows
          .filter((row) => row.inward_date)
          .sort(
            (a, b) =>
              new Date(b.inward_date as string).getTime() -
              new Date(a.inward_date as string).getTime()
          )[0] ?? null;
      const rowUnits = [
        ...new Set(
          rows
            .map((row) => normalizeDisplayUnit(row.unit ?? null))
            .filter((unit): unit is string => Boolean(unit))
        ),
      ];
      const consumed = globalComponentUsage.get(itemId);
      const reorderThresholdQty = (consumed?.consumedQty ?? 0) / monthSpan;
      const pendingOrderQty =
        globalPendingComponentUsage.get(itemId)?.consumedQty ?? 0;
      const sku = item?.sku || consumed?.componentSku || '';
      const itemName = item?.item_name || consumed?.componentName || '';
      const balanceQty = calculateBalancedQtyFromLatestReconciliation({
        inwardRows: rows,
        totalConsumedQty: consumed?.consumedQty ?? 0,
        consumedByDate: globalComponentUsageByDate.get(itemId),
        adjustmentRows: stockAdjustmentsByItemId.get(itemId) ?? [],
        latestReconciliation: latestReconciliationByItemId.get(itemId),
      });

      return {
        id: itemId,
        sku,
        item_name: itemName,
        family: item?.family ?? deriveItemFamily(itemName, sku),
        category: item?.category ?? null,
        default_unit:
          rowUnits.length === 1
            ? rowUnits[0]
            : normalizeDisplayUnit(item?.default_unit ?? consumed?.unit ?? null),
        created_at: item?.created_at ?? '',
        inwardQty,
        consumedQty: consumed?.consumedQty ?? 0,
        reorderThresholdQty,
        pendingOrderQty,
        pendingOrderReorderQty: Math.max(pendingOrderQty - balanceQty, 0),
        balanceQty,
        lastInward: lastInward?.inward_date ?? null,
        lastInwardQty: lastInward?.quantity ?? null,
        lastInwardUnit: normalizeDisplayUnit(lastInward?.unit ?? null),
      };
    })
    .filter((item) => item.sku || item.item_name)
    .filter(
      (item) => item.inwardQty > 0 || item.consumedQty > 0 || item.pendingOrderQty > 0
    );

  const { familyByItemId } = await resolveItemFamilies(
    stockItems.map((item) => ({
      id: item.id,
      item_name: item.item_name,
      sku: item.sku,
      family: item.family,
    }))
  );

  return stockItems.map((item) => {
    const families = familyByItemId.get(item.id) ?? [];
    const fallbackFamily = item.family || deriveItemFamily(item.item_name, item.sku);

    return {
      ...item,
      family: families[0] || fallbackFamily,
      families: families.length ? families : fallbackFamily ? [fallbackFamily] : [],
    };
  }) satisfies StockListItem[];
}

export function filterStockListItems(items: StockListItem[], filters: StockListFilters = {}) {
  const q = filters.q?.trim().toLowerCase() || '';
  const familyFilter = filters.family?.trim() || '';
  const categoryFilter = filters.category?.trim() || '';

  return items.filter((item) => {
    if (q) {
      const haystack = `${item.sku} ${item.item_name}`.toLowerCase();
      if (!haystack.includes(q)) {
        return false;
      }
    }

    if (familyFilter && !item.families.includes(familyFilter)) {
      return false;
    }

    if (categoryFilter && item.category !== categoryFilter) {
      return false;
    }

    return true;
  });
}

export async function getStockSnapshotByFgSku(fgSku: string) {
  const detail = await getBomDetailBySku(fgSku);
  if (!detail) {
    return null;
  }

  const {
    salesByFgSku,
    globalComponentUsage,
    globalComponentUsageByDate,
    selectedComponentUsageByFgSku,
    monthSpan,
  } = await loadComponentConsumption();
  const { selectedPendingComponentUsageByFgSku } = await loadPendingComponentDemand([
    detail,
  ]);

  const selectedComponentUsage =
    selectedComponentUsageByFgSku.get(detail.model.fg_sku) ?? new Map();
  const selectedPendingComponentUsage =
    selectedPendingComponentUsageByFgSku.get(detail.model.fg_sku) ?? new Map();
  const selectedModelSalesRows = salesByFgSku.get(detail.model.fg_sku) ?? [];
  return buildStockSnapshot({
    fgSku: detail.model.fg_sku,
    fgName: detail.model.fg_name,
    isAggregate: false,
    selectedComponentUsage,
    selectedPendingComponentUsage,
    selectedSalesRows: selectedModelSalesRows,
    globalComponentUsage,
    globalComponentUsageByDate,
    monthSpan,
  });
}

export async function getStockSnapshotByFgSkus(
  fgSkus: string[],
  options?: {
    fgSkuLabel?: string;
    fgNameLabel?: string | null;
  }
) {
  const normalizedFgSkus = [...new Set(fgSkus.map((value) => value.trim().toUpperCase()))].filter(
    Boolean
  );

  if (normalizedFgSkus.length === 0) {
    return null;
  }

  if (normalizedFgSkus.length === 1) {
    return getStockSnapshotByFgSku(normalizedFgSkus[0]);
  }

  const {
    bomDetails,
    salesByFgSku,
    globalComponentUsage,
    globalComponentUsageByDate,
    selectedComponentUsageByFgSku,
    monthSpan,
  } = await loadComponentConsumption();
  const { selectedPendingComponentUsageByFgSku } = await loadPendingComponentDemand(
    bomDetails
  );

  const selectedFgSkuSet = new Set(normalizedFgSkus);
  const selectedDetails = bomDetails.filter((detail) => selectedFgSkuSet.has(detail.model.fg_sku));

  if (!selectedDetails.length) {
    return null;
  }

  const selectedComponentUsage = new Map<string, ComponentUsage>();
  const selectedPendingComponentUsage = new Map<string, ComponentUsage>();
  const selectedSalesRows: Array<{ sale_date: string; qty: number }> = [];

  for (const detail of selectedDetails) {
    const usage = selectedComponentUsageByFgSku.get(detail.model.fg_sku) ?? new Map();
    const pendingUsage =
      selectedPendingComponentUsageByFgSku.get(detail.model.fg_sku) ?? new Map();
    const salesRows = salesByFgSku.get(detail.model.fg_sku) ?? [];
    selectedSalesRows.push(...salesRows);

    for (const component of usage.values()) {
      const existing = selectedComponentUsage.get(component.componentItemId) ?? {
        componentItemId: component.componentItemId,
        componentSku: component.componentSku,
        componentName: component.componentName,
        unit: component.unit,
        consumedQty: 0,
      };

      existing.consumedQty += component.consumedQty;
      selectedComponentUsage.set(component.componentItemId, existing);
    }

    for (const component of pendingUsage.values()) {
      const existing = selectedPendingComponentUsage.get(component.componentItemId) ?? {
        componentItemId: component.componentItemId,
        componentSku: component.componentSku,
        componentName: component.componentName,
        unit: component.unit,
        consumedQty: 0,
      };

      existing.consumedQty += component.consumedQty;
      selectedPendingComponentUsage.set(component.componentItemId, existing);
    }
  }

  return buildStockSnapshot({
    fgSku: options?.fgSkuLabel ?? 'ALL MODELS',
    fgName: options?.fgNameLabel ?? 'All Models',
    isAggregate: true,
    selectedComponentUsage,
    selectedPendingComponentUsage,
    selectedSalesRows,
    globalComponentUsage,
    globalComponentUsageByDate,
    monthSpan,
  });
}
