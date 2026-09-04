import { getBomDetailBySku, type BomVersionDetail } from '@/lib/bom';
import { listOrderPortalPendingOrders } from '@/lib/order-pending';
import { getStockSnapshotByFgSku } from '@/lib/stock';
import { getSupabaseInventoryServerClient } from '@/lib/supabase';

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
  limitingComponentNames: string[];
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
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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
    }
  >();

  for (const line of version?.lines ?? []) {
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

export function calculateBuildableQuantity(
  components: Array<{ availableQty: number; qtyPerFg: number }>
) {
  if (components.length === 0) {
    return null;
  }

  return components.reduce((minimum, component) => {
    const componentBuildable = Math.max(
      Math.floor(Math.max(component.availableQty, 0) / component.qtyPerFg),
      0
    );
    return Math.min(minimum, componentBuildable);
  }, Number.POSITIVE_INFINITY);
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

  const { data, error } = await supabase
    .from('production_entries')
    .select(
      'id, bom_model_id, production_date, color_variant, quantity, packed_quantity, report_reference, notes, created_at, updated_at'
    )
    .eq('bom_model_id', model.id)
    .order('production_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load production entries: ${error.message}`);
  }

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

  const [productionEntries, stockSnapshot, pendingRows, salesResult] = await Promise.all([
    listProductionEntries(normalizedSku),
    detail ? getStockSnapshotByFgSku(normalizedSku) : Promise.resolve(null),
    listOrderPortalPendingOrders(),
    supabase
      .from('daily_fg_sales_import')
      .select('sale_date, qty')
      .eq('fg_sku', normalizedSku)
      .order('sale_date', { ascending: false }),
  ]);

  if (salesResult.error) {
    throw new Error(`Failed to load model sales: ${salesResult.error.message}`);
  }

  const today = new Date().toISOString().slice(0, 10);
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

  const preliminaryReadiness = currentLines.map((line) => {
    const stockComponent = componentStockById.get(line.componentItemId);
    const availableQty = Number(stockComponent?.balanceQty ?? 0);
    const buildableQty = Math.max(
      Math.floor(Math.max(availableQty, 0) / line.qtyPerFg),
      0
    );
    const requiredForOpenOrdersQty = pendingOrderQty * line.qtyPerFg;

    return {
      ...line,
      availableQty,
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
  const calculateVariantCapacity = (
    lines: ReturnType<typeof aggregateVariantBomLines>
  ) => {
    const components = lines.map((line) => ({
      ...line,
      availableQty: Number(componentStockById.get(line.componentItemId)?.balanceQty ?? 0),
    }));
    const buildable = calculateBuildableQuantity(components);

    return {
      buildable,
      limitingComponentNames:
        buildable === null
          ? []
          : components
              .filter(
                (component) =>
                  Math.max(
                    Math.floor(
                      Math.max(component.availableQty, 0) / component.qtyPerFg
                    ),
                    0
                  ) === buildable
              )
              .map((component) => component.componentName),
    };
  };
  const colorCapacity = configuredColors.map((color) => {
    const capacity = calculateVariantCapacity(variantLinesByColor.get(color) ?? []);
    return {
      color,
      buildableQty: capacity.buildable,
      limitingComponentNames: capacity.limitingComponentNames,
    };
  });

  let variantBuildableQty: number | null = null;
  if ((currentVersion?.variantLines.length ?? 0) > 0) {
    const redCapacity =
      colorCapacity.find((row) => row.color === 'Red-White')?.buildableQty ?? 0;
    const brownColors = ['Aqua-Brown', 'White-Brown', 'Military Green-Brown'];
    const brownLineSets = brownColors.map(
      (color) => variantLinesByColor.get(color) ?? []
    );
    const sharedBrownIds = brownLineSets.length
      ? new Set(
          brownLineSets[0]
            .map((line) => line.componentItemId)
            .filter((componentItemId) =>
              brownLineSets.every((lines) =>
                lines.some((line) => line.componentItemId === componentItemId)
              )
            )
        )
      : new Set<string>();
    const sharedBrownLines = brownLineSets[0]?.filter((line) =>
      sharedBrownIds.has(line.componentItemId)
    ) ?? [];
    const sharedBrownCapacity = calculateVariantCapacity(sharedBrownLines).buildable;
    const uniqueBrownCapacity = brownLineSets.reduce((sum, lines) => {
      const capacity = calculateVariantCapacity(
        lines.filter((line) => !sharedBrownIds.has(line.componentItemId))
      ).buildable;
      return sum + (capacity ?? 0);
    }, 0);
    const brownCapacity =
      sharedBrownCapacity === null
        ? uniqueBrownCapacity
        : Math.min(sharedBrownCapacity, uniqueBrownCapacity);

    variantBuildableQty = redCapacity + brownCapacity;
  }

  const buildableQty =
    sharedBuildableQty === null
      ? null
      : variantBuildableQty === null
        ? sharedBuildableQty
        : Math.min(sharedBuildableQty, variantBuildableQty);
  const componentReadiness = preliminaryReadiness
    .map((component) => ({
      ...component,
      isLimiting:
        sharedBuildableQty !== null &&
        sharedBuildableQty === buildableQty &&
        component.buildableQty === sharedBuildableQty,
    }))
    .sort((left, right) => {
      if (left.buildableQty !== right.buildableQty) {
        return left.buildableQty - right.buildableQty;
      }

      return left.componentSku.localeCompare(right.componentSku);
    });

  const productionTotalQty = productionEntries.reduce((sum, row) => sum + row.quantity, 0);
  const packedTotalQty = productionEntries.reduce(
    (sum, row) => sum + row.packed_quantity,
    0
  );
  const workInProgressQty = productionTotalQty - packedTotalQty;
  const salesRows = ((salesResult.data ?? []) as SalesRow[]).map((row) => ({
    saleDate: row.sale_date,
    quantity: Number(row.qty ?? 0),
  }));
  const salesTotalQty = salesRows.reduce((sum, row) => sum + row.quantity, 0);
  const reportedFinishedGoodsQty = packedTotalQty - salesTotalQty;
  const pendingAfterFinishedGoodsQty = Math.max(
    pendingOrderQty - Math.max(reportedFinishedGoodsQty, 0),
    0
  );
  const recommendedBuildQty =
    buildableQty === null ? null : Math.min(buildableQty, pendingAfterFinishedGoodsQty);

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
  };
}
