import { getBomDetailBySku, type BomVersionDetail } from '@/lib/bom';
import { listOrderPortalPendingOrders } from '@/lib/order-pending';
import { getStockSnapshotByFgSku } from '@/lib/stock';
import { getSupabaseInventoryServerClient } from '@/lib/supabase';
import { loadAllRows } from '@/lib/supabase-pagination';
import { calculateBuildableMix, calculateBuildableQuantity, calculateDemandPlanning, dateAgeDays } from '@/lib/production-analytics';

export { calculateBuildableQuantity } from '@/lib/production-analytics';

export const FR_CRUZER_SKU = 'FR-CRUZER';

export const FR_CRUZER_COLORS = [
  'Red-White',
  'Aqua-Brown',
  'White-Brown',
  'Military Green-Brown',
] as const;

export type ProductionEntry = {
  id: string;
  bom_model_id: string;
  production_date: string;
  color_variant: string;
  quantity: number;
  packed_quantity: number;
  report_reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductionComponentReadiness = {
  componentItemId: string;
  componentSku: string;
  componentName: string;
  unit: string | null;
  qtyPerFg: number;
  consumptionStage: 'assembled' | 'packed' | 'mixed';
  inwardQty: number;
  consumedQty: number;
  inwardUnits: string[];
  hasUnitConflict: boolean;
  availableQty: number;
  buildableQty: number;
  requiredForOpenOrdersQty: number;
  shortageForOpenOrdersQty: number;
  isLimiting: boolean;
  photoUrl: string | null;
  lastInwardDate: string | null;
  lastInwardQty: number | null;
  lastInwardUnit: string | null;
};

const FR_CRUZER_COMPONENT_PHOTOS: Record<string, string> = {
  'FR001-2121-R': '/components/fr-cruzer/fr001-2121-r.webp',
  'FR001-2121-L': '/components/fr-cruzer/fr001-2121-l.webp',
  'FR001-2122': '/components/fr-cruzer/fr001-2122.webp',
  'FR001-2123-BROWN': '/components/fr-cruzer/fr001-2123-brown.webp',
  'FR001-2125-BROWN': '/components/fr-cruzer/fr001-2125-brown.webp',
  'FR001-2126-BROWN': '/components/fr-cruzer/fr001-2126-brown.webp',
  'FR001-2130': '/components/fr-cruzer/fr001-2130.webp',
  'FR001-2131': '/components/fr-cruzer/fr001-2131.webp',
  'FR001-2132': '/components/fr-cruzer/fr001-2132.webp',
  'FR001-2133': '/components/fr-cruzer/fr001-2133.webp',
  'FR001-2135': '/components/fr-cruzer/fr001-2135.webp',
  'FR001-2139': '/components/fr-cruzer/fr001-2139.webp',
  'FR001-2140': '/components/fr-cruzer/fr001-2140.webp',
  'FR001-2141-BIG': '/components/fr-cruzer/fr001-2141-big.webp',
  'FR001-2141-SMALL': '/components/fr-cruzer/fr001-2141-small.webp',
  'FR001-BACKREST-PIPE': '/components/fr-cruzer/fr001-backrest-pipe.webp',
  'FR001-DRIVE-MOTOR': '/components/fr-cruzer/fr001-drive-motor.webp',
  'FR001-HANDLE-GRIP': '/components/fr-cruzer/fr001-handle-grip.webp',
  'FR001-MOTOR': '/components/fr-cruzer/fr001-drive-motor.webp',
  'FR001-MUSIC-BOARD': '/components/fr-cruzer/fr001-mp3.webp',
  'FR001-MP3': '/components/fr-cruzer/fr001-mp3.webp',
  'FR001-OUTER': '/components/fr-cruzer/fr001-outer.webp',
};

export type ProductionColorCapacity = {
  color: string;
  buildableQty: number | null;
  variantBuildableQty: number | null;
  limitingComponentNames: string[];
};

export type ProductionVariantComponentReadiness = Omit<ProductionComponentReadiness, 'requiredForOpenOrdersQty' | 'shortageForOpenOrdersQty'> & {
  colors: string[];
  requiredForOpenOrdersQty: null;
  shortageForOpenOrdersQty: null;
};

export type ProductionAlert = {
  code: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  componentItemIds: string[];
};

export type ProductionDashboard = {
  fgSku: string;
  fgName: string | null;
  bomModelId: string | null;
  bomVersionId: string | null;
  bomVersionNo: number | null;
  bomEffectiveFrom: string | null;
  bomLineCount: number;
  variantBomLineCount: number;
  productionEntries: ProductionEntry[];
  colorSummary: Array<{ color: string; quantity: number; packedQuantity: number }>;
  colorCapacity: ProductionColorCapacity[];
  productionTotalQty: number;
  packedTotalQty: number;
  workInProgressQty: number;
  salesRows: Array<{ saleDate: string; quantity: number }>;
  salesTotalQty: number;
  reportedFinishedGoodsQty: number;
  pendingOrderRows: Array<{ referenceDate: string; quantity: number }>;
  pendingOrderQty: number;
  pendingAfterFinishedGoodsQty: number;
  buildableQty: number | null;
  recommendedBuildQty: number | null;
  componentReadiness: ProductionComponentReadiness[];
  variantComponentReadiness: ProductionVariantComponentReadiness[];
  sharedBuildableQty: number | null;
  variantBuildableQty: number | null;
  capacityIsExact: boolean;
  demandPlanning: ReturnType<typeof calculateDemandPlanning>;
  dataFreshness: {
    calculatedAt: string;
    latestProductionDate: string | null;
    latestSalesDate: string | null;
    latestInwardDate: string | null;
    productionAgeDays: number | null;
    salesAgeDays: number | null;
  };
  alerts: ProductionAlert[];
};

type ProductionEntryRow = Omit<ProductionEntry, 'quantity' | 'packed_quantity'> & {
  quantity: number | string;
  packed_quantity: number | string;
};

type SalesRow = {
  sale_date: string;
  qty: number;
};

function normalizeFgSku(value: string) {
  return value.trim().toUpperCase();
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function normalizeProductionEntry(row: ProductionEntryRow): ProductionEntry {
  return {
    ...row,
    quantity: Number(row.quantity ?? 0),
    packed_quantity: Number(row.packed_quantity ?? 0),
  };
}

function selectEffectiveBomVersion(versions: BomVersionDetail[], date: string) {
  return (
    versions
      .filter((version) => version.effective_from <= date)
      .sort((left, right) => right.effective_from.localeCompare(left.effective_from))[0] ??
    null
  );
}

function aggregateCurrentBomLines(version: BomVersionDetail | null) {
  const aggregated = new Map<
    string,
    {
      componentItemId: string;
      componentSku: string;
      componentName: string;
      unit: string | null;
      qtyPerFg: number;
      qtyPerAssembly: number;
      qtyPerPack: number;
      consumptionStage: 'assembled' | 'packed' | 'mixed';
    }
  >();

  for (const line of version?.lines ?? []) {
    const current = aggregated.get(line.component_item_id);
    if (current) {
      current.qtyPerFg += Number(line.qty_per_fg ?? 0);
      if (line.consumption_stage === 'packed') current.qtyPerPack += Number(line.qty_per_fg ?? 0);
      else current.qtyPerAssembly += Number(line.qty_per_fg ?? 0);
      if (current.consumptionStage !== line.consumption_stage) current.consumptionStage = 'mixed';
      continue;
    }

    aggregated.set(line.component_item_id, {
      componentItemId: line.component_item_id,
      componentSku: line.component_sku,
      componentName: line.component_name,
      unit: line.unit,
      qtyPerFg: Number(line.qty_per_fg ?? 0),
      qtyPerAssembly: line.consumption_stage === 'packed' ? 0 : Number(line.qty_per_fg ?? 0),
      qtyPerPack: line.consumption_stage === 'packed' ? Number(line.qty_per_fg ?? 0) : 0,
      consumptionStage: line.consumption_stage,
    });
  }

  return [...aggregated.values()];
}

function aggregateVariantBomLines(version: BomVersionDetail | null, color: string) {
  const aggregated = new Map<
    string,
    {
      componentItemId: string;
      componentSku: string;
      componentName: string;
      unit: string | null;
      qtyPerFg: number;
    }
  >();

  for (const line of version?.variantLines ?? []) {
    if (line.color_variant !== color) {
      continue;
    }

    const current = aggregated.get(line.component_item_id);
    if (current) {
      current.qtyPerFg += Number(line.qty_per_fg ?? 0);
      continue;
    }

    aggregated.set(line.component_item_id, {
      componentItemId: line.component_item_id,
      componentSku: line.component_sku,
      componentName: line.component_name,
      unit: line.unit,
      qtyPerFg: Number(line.qty_per_fg ?? 0),
    });
  }

  return [...aggregated.values()];
}

export async function listProductionEntries(fgSku: string) {
  const normalizedSku = normalizeFgSku(fgSku);
  const supabase = getSupabaseInventoryServerClient();
  const { data: model, error: modelError } = await supabase
    .from('bom_models')
    .select('id')
    .eq('fg_sku', normalizedSku)
    .maybeSingle();

  if (modelError) {
    throw new Error(`Failed to load production model: ${modelError.message}`);
  }

  if (!model) {
    return [];
  }

  const data = await loadAllRows<ProductionEntryRow>((from, to) => supabase
    .from('production_entries')
    .select(
      'id, bom_model_id, production_date, color_variant, quantity, packed_quantity, report_reference, notes, created_at, updated_at'
    )
    .eq('bom_model_id', model.id)
    .order('production_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to), 'Failed to load production entries');

  return ((data ?? []) as ProductionEntryRow[]).map(normalizeProductionEntry);
}

export async function createProductionEntry(input: {
  fgSku: string;
  productionDate: string;
  colorVariant: string;
  quantity: number;
  packedQuantity: number;
  reportReference: string | null;
  notes: string | null;
}) {
  const fgSku = normalizeFgSku(input.fgSku);
  const productionDate = input.productionDate.trim();
  const colorVariant = input.colorVariant.trim();
  const quantity = Number(input.quantity);
  const packedQuantity = Number(input.packedQuantity);

  if (!fgSku) {
    throw new Error('Finished-good SKU is required.');
  }

  if (!isIsoDate(productionDate)) {
    throw new Error('Production date is required in YYYY-MM-DD format.');
  }

  if (!colorVariant) {
    throw new Error('Production colour is required.');
  }

  if (
    fgSku === FR_CRUZER_SKU &&
    !FR_CRUZER_COLORS.includes(colorVariant as (typeof FR_CRUZER_COLORS)[number])
  ) {
    throw new Error('Choose one of the configured FR-Cruzer colours.');
  }

  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error('Assembled quantity must be a whole number of zero or more.');
  }

  if (!Number.isInteger(packedQuantity) || packedQuantity < 0) {
    throw new Error('Packed quantity must be a whole number of zero or more.');
  }

  if (quantity === 0 && packedQuantity === 0) {
    throw new Error('Enter an assembled quantity, a packed quantity, or both.');
  }

  const supabase = getSupabaseInventoryServerClient();
  const { data: model, error: modelError } = await supabase
    .from('bom_models')
    .select('id')
    .eq('fg_sku', fgSku)
    .maybeSingle();

  if (modelError) {
    throw new Error(`Failed to validate production model: ${modelError.message}`);
  }

  if (!model) {
    throw new Error('Create the model in BOM Management before recording production.');
  }

  const { data, error } = await supabase
    .from('production_entries')
    .insert({
      bom_model_id: model.id,
      production_date: productionDate,
      color_variant: colorVariant,
      quantity,
      packed_quantity: packedQuantity,
      report_reference: input.reportReference?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select(
      'id, bom_model_id, production_date, color_variant, quantity, packed_quantity, report_reference, notes, created_at, updated_at'
    )
    .single();

  if (error) {
    throw new Error(`Failed to save production entry: ${error.message}`);
  }

  return normalizeProductionEntry(data as ProductionEntryRow);
}

export async function deleteProductionEntry(entryId: string) {
  const normalizedId = entryId.trim();
  if (!normalizedId) {
    throw new Error('Production entry id is required.');
  }

  const supabase = getSupabaseInventoryServerClient();
  const { data, error } = await supabase
    .from('production_entries')
    .delete()
    .eq('id', normalizedId)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to delete production entry: ${error.message}`);
  }

  if (!data) {
    throw new Error('Production entry not found.');
  }

  return data.id as string;
}

export async function getProductionDashboard(fgSku: string): Promise<ProductionDashboard> {
  const normalizedSku = normalizeFgSku(fgSku);
  const supabase = getSupabaseInventoryServerClient();
  const detail = await getBomDetailBySku(normalizedSku);

  const [productionEntries, stockSnapshot, pendingRows, rawSalesRows] = await Promise.all([
    listProductionEntries(normalizedSku),
    detail ? getStockSnapshotByFgSku(normalizedSku) : Promise.resolve(null),
    listOrderPortalPendingOrders(),
    loadAllRows<SalesRow>((from, to) => supabase
      .from('daily_fg_sales_import')
      .select('sale_date, qty')
      .eq('fg_sku', normalizedSku)
      .order('sale_date', { ascending: false })
      .range(from, to), 'Failed to load model sales'),
  ]);
  const calculatedAt = new Date().toISOString();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(calculatedAt));
  const currentVersion = selectEffectiveBomVersion(detail?.versions ?? [], today);
  const currentLines = aggregateCurrentBomLines(currentVersion);
  const componentStockById = new Map(
    (stockSnapshot?.components ?? []).map((component) => [component.componentItemId, component])
  );
  const matchingPendingRows = pendingRows
    .filter((row) => row.model_key === normalizedSku)
    .map((row) => ({
      referenceDate: row.reference_date,
      quantity: Number(row.qty ?? 0),
    }));
  const pendingOrderQty = matchingPendingRows.reduce((sum, row) => sum + row.quantity, 0);
  const productionTotalQty = productionEntries.reduce((sum, row) => sum + row.quantity, 0);
  const packedTotalQty = productionEntries.reduce((sum, row) => sum + row.packed_quantity, 0);
  const workInProgressQty = productionTotalQty - packedTotalQty;
  const salesRows = rawSalesRows.map((row) => ({ saleDate: row.sale_date, quantity: Number(row.qty ?? 0) }));
  const salesTotalQty = salesRows.reduce((sum, row) => sum + row.quantity, 0);
  const reportedFinishedGoodsQty = packedTotalQty - salesTotalQty;
  const packingLines = currentLines.filter((line) => line.qtyPerPack > 0).map((line) => ({
    qtyPerFg: line.qtyPerPack,
    availableQty: Number(componentStockById.get(line.componentItemId)?.balanceQty ?? 0),
    hasUnitConflict: componentStockById.get(line.componentItemId)?.hasUnitConflict ?? false,
  }));
  const packingCapacityQty = packingLines.length ? calculateBuildableQuantity(packingLines) : currentVersion ? Math.max(workInProgressQty, 0) : null;
  const demandPlanning = calculateDemandPlanning({ pendingOrderQty, productionTotalQty, packedTotalQty, salesTotalQty, packingCapacityQty });
  const pendingAfterFinishedGoodsQty = demandPlanning.packingRequiredQty;

  const preliminaryReadiness = currentLines.map((line) => {
    const stockComponent = componentStockById.get(line.componentItemId);
    const availableQty = Number(stockComponent?.balanceQty ?? 0);
    const hasUnitConflict = stockComponent?.hasUnitConflict ?? false;
    const buildableQty = calculateBuildableQuantity([{ availableQty, qtyPerFg: line.qtyPerFg, hasUnitConflict }]) ?? 0;
    const requiredForOpenOrdersQty = demandPlanning.newAssemblyRequiredQty * line.qtyPerAssembly + demandPlanning.packingRequiredQty * line.qtyPerPack;

    return {
      ...line,
      availableQty,
      inwardQty: Number(stockComponent?.inwardQty ?? 0),
      consumedQty: Number(stockComponent?.consumedQty ?? 0),
      inwardUnits: stockComponent?.inwardUnits ?? [],
      hasUnitConflict,
      buildableQty,
      requiredForOpenOrdersQty,
      shortageForOpenOrdersQty: Math.max(requiredForOpenOrdersQty - availableQty, 0),
      photoUrl:
        normalizedSku === FR_CRUZER_SKU
          ? FR_CRUZER_COMPONENT_PHOTOS[line.componentSku] ?? null
          : null,
      lastInwardDate: stockComponent?.lastInwardDate ?? null,
      lastInwardQty: stockComponent?.lastInwardQty ?? null,
      lastInwardUnit: stockComponent?.lastInwardUnit ?? null,
    };
  });
  const sharedBuildableQty = calculateBuildableQuantity(preliminaryReadiness);

  const configuredColors =
    normalizedSku === FR_CRUZER_SKU
      ? [...FR_CRUZER_COLORS]
      : [
          ...new Set(
            (currentVersion?.variantLines ?? []).map((line) => line.color_variant)
          ),
        ];
  const variantLinesByColor = new Map(
    configuredColors.map((color) => [color, aggregateVariantBomLines(currentVersion, color)])
  );
  const variantComponentsByColor = new Map(configuredColors.map((color) => [color,
    (variantLinesByColor.get(color) ?? []).map((line) => ({
      ...line,
      availableQty: Number(componentStockById.get(line.componentItemId)?.balanceQty ?? 0),
      hasUnitConflict: componentStockById.get(line.componentItemId)?.hasUnitConflict ?? false,
    }))
  ]));
  const hasVariantBom = (currentVersion?.variantLines.length ?? 0) > 0;
  const allColorComponents = configuredColors.map((color) => {
    const aggregated = new Map<string, { componentItemId: string; componentName: string; availableQty: number; qtyPerFg: number; hasUnitConflict: boolean }>();
    for (const line of [...preliminaryReadiness, ...(variantComponentsByColor.get(color) ?? [])]) {
      const previous = aggregated.get(line.componentItemId);
      aggregated.set(line.componentItemId, { ...line, qtyPerFg: (previous?.qtyPerFg ?? 0) + line.qtyPerFg });
    }
    return [...aggregated.values()];
  });
  const colorCapacity = configuredColors.map((color) => {
    const variants = variantComponentsByColor.get(color) ?? [];
    const components = allColorComponents[configuredColors.indexOf(color)];
    const capacity = hasVariantBom && !variants.length ? null : calculateBuildableQuantity(components);
    return {
      color,
      buildableQty: capacity,
      variantBuildableQty: calculateBuildableQuantity(variants),
      limitingComponentNames: capacity === null ? [] : components.filter((row) => calculateBuildableQuantity([row]) === capacity).map((row) => row.componentName),
    };
  });
  const variantMix = calculateBuildableMix([...variantComponentsByColor.values()]);
  const fullMix = hasVariantBom ? calculateBuildableMix(allColorComponents.filter((_, index) => (variantComponentsByColor.get(configuredColors[index])?.length ?? 0) > 0)) : { quantity: sharedBuildableQty, isExact: sharedBuildableQty !== null };
  const hasMissingColorBom = hasVariantBom && configuredColors.some((color) => !variantLinesByColor.get(color)?.length);
  const hasCompleteBom = Boolean(currentVersion) && currentLines.length > 0 && !hasMissingColorBom;
  const hasUnitConflicts = preliminaryReadiness.some((row) => row.hasUnitConflict) || [...variantComponentsByColor.values()].some((rows) => rows.some((row) => row.hasUnitConflict));
  const capacityIsExact = fullMix.isExact && hasCompleteBom && !hasUnitConflicts;
  const variantBuildableQty = hasVariantBom ? variantMix.quantity : null;
  const buildableQty = fullMix.quantity;
  const componentReadiness = preliminaryReadiness
    .map((component) => ({
      ...component,
      isLimiting:
        !component.hasUnitConflict && sharedBuildableQty !== null &&
        sharedBuildableQty === buildableQty &&
        component.buildableQty === sharedBuildableQty,
    }))
    .sort((left, right) => {
      if (left.buildableQty !== right.buildableQty) {
        return left.buildableQty - right.buildableQty;
      }

      return left.componentSku.localeCompare(right.componentSku);
    });

  // Finish the recommended WIP first; its packing parts cannot also fund new bikes.
  const reservedPackingQty = demandPlanning.recommendedPackQty ?? 0;
  const packingPerItem = new Map(currentLines.map((line) => [line.componentItemId, line.qtyPerPack]));
  const remainingMix = hasVariantBom ? calculateBuildableMix(allColorComponents.filter((_, index) => (variantComponentsByColor.get(configuredColors[index])?.length ?? 0) > 0).map((rows) => rows.map((row) => ({ ...row, availableQty: row.availableQty - reservedPackingQty * (packingPerItem.get(row.componentItemId) ?? 0) })))) : { quantity: calculateBuildableQuantity(preliminaryReadiness.map((row) => ({ ...row, availableQty: row.availableQty - reservedPackingQty * row.qtyPerPack }))) };
  const recommendedBuildQty =
    remainingMix.quantity === null ? null : Math.min(remainingMix.quantity, demandPlanning.newAssemblyRequiredQty);

  const variantReadinessById = new Map<string, ProductionVariantComponentReadiness>();
  for (const [color, lines] of variantComponentsByColor) {
    const variantCapacity = calculateBuildableQuantity(lines);
    for (const line of lines) {
      const previous = variantReadinessById.get(line.componentItemId);
      if (previous) {
        previous.colors.push(color);
        previous.isLimiting ||= !line.hasUnitConflict && variantCapacity !== null && calculateBuildableQuantity([line]) === variantCapacity;
        continue;
      }
      const stock = componentStockById.get(line.componentItemId);
      variantReadinessById.set(line.componentItemId, {
        ...line, colors: [color], consumptionStage: 'assembled',
        inwardQty: Number(stock?.inwardQty ?? 0), consumedQty: Number(stock?.consumedQty ?? 0),
        inwardUnits: stock?.inwardUnits ?? [],
        buildableQty: calculateBuildableQuantity([line]) ?? 0,
        requiredForOpenOrdersQty: null, shortageForOpenOrdersQty: null,
        isLimiting: !line.hasUnitConflict && variantCapacity !== null && calculateBuildableQuantity([line]) === variantCapacity,
        photoUrl: normalizedSku === FR_CRUZER_SKU ? FR_CRUZER_COMPONENT_PHOTOS[line.componentSku] ?? null : null,
        lastInwardDate: stock?.lastInwardDate ?? null, lastInwardQty: stock?.lastInwardQty ?? null, lastInwardUnit: stock?.lastInwardUnit ?? null,
      });
    }
  }
  const variantComponentReadiness = [...variantReadinessById.values()].sort((left, right) => left.buildableQty - right.buildableQty || left.componentSku.localeCompare(right.componentSku));

  const colorTotals = productionEntries.reduce((map, row) => {
    const current = map.get(row.color_variant) ?? { quantity: 0, packedQuantity: 0 };
    current.quantity += row.quantity;
    current.packedQuantity += row.packed_quantity;
    map.set(row.color_variant, current);
    return map;
  }, new Map<string, { quantity: number; packedQuantity: number }>());
  const colorSummary = [
    ...configuredColors,
    ...[...colorTotals.keys()].filter((color) => !configuredColors.includes(color as never)),
  ].map((color) => ({
    color,
    quantity: colorTotals.get(color)?.quantity ?? 0,
    packedQuantity: colorTotals.get(color)?.packedQuantity ?? 0,
  }));

  const allReadiness = [...componentReadiness, ...variantComponentReadiness];
  const latestInwardDate = allReadiness.reduce<string | null>((latest, row) => row.lastInwardDate && (!latest || row.lastInwardDate > latest) ? row.lastInwardDate : latest, null);
  const latestProductionDate = productionEntries[0]?.production_date ?? null;
  const latestSalesDate = salesRows[0]?.saleDate ?? null;
  const dataFreshness = {
    calculatedAt, latestProductionDate, latestSalesDate, latestInwardDate,
    productionAgeDays: dateAgeDays(latestProductionDate, today),
    salesAgeDays: dateAgeDays(latestSalesDate, today),
  };
  const alerts: ProductionAlert[] = [];
  const incompatibleUnits = allReadiness.filter((row) => row.hasUnitConflict);
  if (incompatibleUnits.length) alerts.push({
    code: 'inward-unit-conflict', severity: 'critical', title: `${incompatibleUnits.length} components need unit clarification`,
    message: `${incompatibleUnits.slice(0, 3).map((row) => row.componentSku).join(', ')}${incompatibleUnits.length > 3 ? ` and ${incompatibleUnits.length - 3} more` : ''}: inward weight and BOM piece counts are incompatible. Enter piece counts or a verified kg-to-pcs conversion.`,
    componentItemIds: incompatibleUnits.map((row) => row.componentItemId),
  });
  const negativeComponents = allReadiness.filter((row) => !row.hasUnitConflict && row.availableQty < 0);
  if (negativeComponents.length) alerts.push({
    code: 'negative-stock', severity: 'critical', title: `${negativeComponents.length} component${negativeComponents.length === 1 ? '' : 's'} need stock reconciliation`,
    message: 'Recorded consumption exceeds stock received. Verify inward entries or enter a physical count before relying on capacity.',
    componentItemIds: negativeComponents.map((row) => row.componentItemId),
  });
  const commonShortages = componentReadiness.filter((row) => !row.hasUnitConflict && row.shortageForOpenOrdersQty > 0);
  if (commonShortages.length && pendingAfterFinishedGoodsQty > 0) alerts.push({
    code: 'material-shortage', severity: buildableQty === 0 ? 'critical' : 'warning', title: `${commonShortages.length} shared component${commonShortages.length === 1 ? '' : 's'} short for orders`,
    message: `Demand allows for ${demandPlanning.readyToDispatchQty.toLocaleString('en-IN')} ready bikes and ${demandPlanning.wipAvailableQty.toLocaleString('en-IN')} in assembly. Review the remaining component requirements.`,
    componentItemIds: commonShortages.map((row) => row.componentItemId),
  });
  const unavailableVariants = variantComponentReadiness.filter((row) => !row.hasUnitConflict && row.buildableQty === 0);
  if (unavailableVariants.length) alerts.push({
    code: 'colour-stockout', severity: 'warning', title: 'Some colours are blocked by plastic parts',
    message: `${[...new Set(unavailableVariants.flatMap((row) => row.colors))].join(', ')} cannot be assembled from current colour stock.`,
    componentItemIds: unavailableVariants.map((row) => row.componentItemId),
  });
  const ledgerIssues = colorSummary
    .filter((row) => row.packedQuantity > row.quantity)
    .map((row) => `${row.color}: ${(row.packedQuantity - row.quantity).toLocaleString('en-IN')} more packed than assembled`);
  if (workInProgressQty < 0) ledgerIssues.push(`Model total: ${(-workInProgressQty).toLocaleString('en-IN')} more packed than assembled`);
  if (reportedFinishedGoodsQty < 0) ledgerIssues.push(`Model total: ${(-reportedFinishedGoodsQty).toLocaleString('en-IN')} more sold than packed`);
  if (ledgerIssues.length) alerts.push({
    code: 'production-ledger-mismatch', severity: 'critical', title: 'Production and sales totals need review',
    message: `${ledgerIssues.slice(0, 3).join('; ')}${ledgerIssues.length > 3 ? `; ${ledgerIssues.length - 3} more discrepancies` : ''}. Check report coverage and opening stock.`, componentItemIds: [],
  });
  if (!hasCompleteBom) alerts.push({
    code: 'incomplete-bom', severity: 'warning', title: 'BOM coverage is incomplete',
    message: 'A current shared BOM and a mapped BOM for each colour are needed to establish full production capacity.', componentItemIds: [],
  });
  const staleSources = [
    dataFreshness.productionAgeDays === null ? 'production (no report)' : dataFreshness.productionAgeDays > 7 ? `production (${dataFreshness.productionAgeDays} days)` : null,
    dataFreshness.salesAgeDays === null ? 'sales (no report)' : dataFreshness.salesAgeDays > 7 ? `sales (${dataFreshness.salesAgeDays} days)` : null,
  ].filter(Boolean);
  if (staleSources.length) alerts.push({
    code: 'stale-reports', severity: 'warning', title: 'Check report freshness',
    message: `Latest recorded activity: ${staleSources.join('; ')}. Confirm the reports are up to date.`, componentItemIds: [],
  });
  if (!capacityIsExact && !hasUnitConflicts && buildableQty !== null) alerts.push({
    code: 'capacity-lower-bound', severity: 'info', title: hasCompleteBom ? 'Capacity is a conservative estimate' : 'Capacity uses incomplete BOM coverage',
    message: hasMissingColorBom
      ? 'Capacity counts mapped colours. Complete the missing colour BOMs before treating this as full model capacity.'
      : !hasCompleteBom
        ? 'Capacity counts configured components. Complete the shared BOM before treating this as full model capacity.'
        : 'The feasible colour mix uses shared stock once; a different allocation may allow more bikes.', componentItemIds: [],
  });

  return {
    fgSku: normalizedSku,
    fgName: detail?.model.fg_name ?? null,
    bomModelId: detail?.model.id ?? null,
    bomVersionId: currentVersion?.id ?? null,
    bomVersionNo: currentVersion?.version_no ?? null,
    bomEffectiveFrom: currentVersion?.effective_from ?? null,
    bomLineCount: currentLines.length,
    variantBomLineCount: currentVersion?.variantLines.length ?? 0,
    productionEntries,
    colorSummary,
    colorCapacity,
    productionTotalQty,
    packedTotalQty,
    workInProgressQty,
    salesRows,
    salesTotalQty,
    reportedFinishedGoodsQty,
    pendingOrderRows: matchingPendingRows,
    pendingOrderQty,
    pendingAfterFinishedGoodsQty,
    buildableQty,
    recommendedBuildQty,
    componentReadiness,
    variantComponentReadiness,
    sharedBuildableQty,
    variantBuildableQty,
    capacityIsExact,
    demandPlanning,
    dataFreshness,
    alerts,
  };
}
