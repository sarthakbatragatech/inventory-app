import { getBomDetailBySku, listBomModels } from '@/lib/bom';
import { deriveItemFamily } from '@/lib/item-family';
import { resolveItemFamilies } from '@/lib/item-family-links';
import { getSupabaseInventoryServerClient } from '@/lib/supabase';

export type StockComponentRow = {
  componentItemId: string;
  componentSku: string;
  componentName: string;
  unit: string | null;
  inwardQty: number;
  selectedModelConsumedQty: number;
  consumedQty: number;
  reorderThresholdQty: number;
  balanceQty: number;
};

export type StockModelSnapshot = {
  fgSku: string;
  fgName: string | null;
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
  balanceQty: number;
  lastInward: string | null;
  lastInwardQty: number | null;
  lastInwardUnit: string | null;
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
    selectedComponentUsageByFgSku,
    globalSalesDateFrom,
    globalSalesDateTo,
    monthSpan,
  };
}

export async function getStockListItems() {
  const supabase = getSupabaseInventoryServerClient();
  const [
    { globalComponentUsage, monthSpan },
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

  const latestBatchIds = [
    ...new Map(
      ((batches ?? []) as BatchRecord[]).map((batch) => [batch.file_name, batch])
    ).values(),
  ].map((batch) => batch.id);

  const itemList = (items ?? []) as ItemRecord[];
  const allItemIds = new Set(itemList.map((item) => item.id));
  for (const componentItemId of globalComponentUsage.keys()) {
    allItemIds.add(componentItemId);
  }

  const inwardRows: InwardRow[] = [];
  const itemIds = [...allItemIds];

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
      const sku = item?.sku || consumed?.componentSku || '';
      const itemName = item?.item_name || consumed?.componentName || '';

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
        balanceQty: inwardQty - (consumed?.consumedQty ?? 0),
        lastInward: lastInward?.inward_date ?? null,
        lastInwardQty: lastInward?.quantity ?? null,
        lastInwardUnit: normalizeDisplayUnit(lastInward?.unit ?? null),
      };
    })
    .filter((item) => item.sku || item.item_name)
    .filter((item) => item.inwardQty > 0 || item.consumedQty > 0);

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

export async function getStockSnapshotByFgSku(fgSku: string) {
  const detail = await getBomDetailBySku(fgSku);
  if (!detail) {
    return null;
  }

  const supabase = getSupabaseInventoryServerClient();
  const {
    salesByFgSku,
    globalComponentUsage,
    selectedComponentUsageByFgSku,
    monthSpan,
  } = await loadComponentConsumption();

  const selectedComponentUsage =
    selectedComponentUsageByFgSku.get(detail.model.fg_sku) ?? new Map();
  const componentItemIds = [...selectedComponentUsage.keys()];
  const inwardTotals = new Map<string, number>();

  if (componentItemIds.length > 0) {
    const { data: inwardRows, error: inwardError } = await supabase
      .from('import_batch_rows')
      .select('item_id, quantity')
      .in('item_id', componentItemIds);

    if (inwardError) {
      throw new Error(`Failed to load component inward rows: ${inwardError.message}`);
    }

    for (const row of (inwardRows ?? []) as InwardRow[]) {
      const existing = inwardTotals.get(row.item_id) ?? 0;
      inwardTotals.set(row.item_id, existing + Number(row.quantity ?? 0));
    }
  }

  const selectedModelSalesRows = salesByFgSku.get(detail.model.fg_sku) ?? [];

  const components: StockComponentRow[] = [...selectedComponentUsage.values()]
    .map((component) => {
      const inwardQty = inwardTotals.get(component.componentItemId) ?? 0;
      const selectedModelConsumedQty = component.consumedQty;
      const consumedQty =
        globalComponentUsage.get(component.componentItemId)?.consumedQty ?? 0;
      const reorderThresholdQty = consumedQty / monthSpan;

      return {
        componentItemId: component.componentItemId,
        componentSku: component.componentSku,
        componentName: component.componentName,
        unit: component.unit,
        inwardQty,
        selectedModelConsumedQty,
        consumedQty,
        reorderThresholdQty,
        balanceQty: inwardQty - consumedQty,
      };
    })
    .sort((left, right) => {
      if (left.balanceQty !== right.balanceQty) {
        return left.balanceQty - right.balanceQty;
      }

      return left.componentSku.localeCompare(right.componentSku);
    });

  return {
    fgSku: detail.model.fg_sku,
    fgName: detail.model.fg_name,
    salesQty: selectedModelSalesRows.reduce((sum, row) => sum + row.qty, 0),
    salesDateFrom: selectedModelSalesRows[0]?.sale_date ?? null,
    salesDateTo:
      selectedModelSalesRows[selectedModelSalesRows.length - 1]?.sale_date ?? null,
    components,
  } satisfies StockModelSnapshot;
}
