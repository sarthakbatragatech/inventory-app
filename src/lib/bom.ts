import { getSupabaseInventoryServerClient } from '@/lib/supabase';
import { listOrderPortalSalesCatalog } from '@/lib/order-sales';

export type BomModelSummary = {
  id: string;
  fg_sku: string;
  fg_name: string | null;
  source_item_id: string | null;
  created_at: string;
  updated_at: string;
};

export type BomVersionRecord = {
  id: string;
  bom_model_id: string;
  version_no: number;
  effective_from: string;
  notes: string | null;
  created_at: string;
};

export type BomLineRecord = {
  id: string;
  bom_version_id: string;
  component_item_id: string;
  component_sku: string;
  component_name: string;
  qty_per_fg: number;
  unit: string | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
};

export type BomVersionDetail = BomVersionRecord & {
  lines: BomLineRecord[];
};

export type BomDetail = {
  model: BomModelSummary;
  versions: BomVersionDetail[];
};

export type BomCatalogItem = {
  fg_sku: string;
  fg_name: string | null;
  source_item_id: string | null;
};

export type ComponentItemOption = {
  id: string;
  sku: string;
  item_name: string;
  default_unit: string | null;
  category: string | null;
};

export type BomVersionLookup = {
  model: BomModelSummary;
  version: BomVersionRecord;
  lines: BomLineRecord[];
};

export type BomVersionLineInput = {
  componentItemId: string;
  componentSku: string;
  componentName: string;
  qtyPerFg: number;
  unit: string | null;
  notes: string | null;
};

export async function listBomModels() {
  const supabase = getSupabaseInventoryServerClient();
  const { data, error } = await supabase
    .from('bom_models')
    .select('id, fg_sku, fg_name, source_item_id, created_at, updated_at')
    .order('fg_sku', { ascending: true });

  if (error) {
    throw new Error(`Failed to load BOM models: ${error.message}`);
  }

  return (data ?? []) as BomModelSummary[];
}

export async function getBomDetailBySku(fgSku: string) {
  const supabase = getSupabaseInventoryServerClient();
  const normalizedSku = fgSku.trim().toUpperCase();

  if (!normalizedSku) {
    return null;
  }

  const { data: model, error: modelError } = await supabase
    .from('bom_models')
    .select('id, fg_sku, fg_name, source_item_id, created_at, updated_at')
    .eq('fg_sku', normalizedSku)
    .maybeSingle();

  if (modelError) {
    throw new Error(`Failed to load BOM model: ${modelError.message}`);
  }

  if (!model) {
    return null;
  }

  const { data: versions, error: versionError } = await supabase
    .from('bom_versions')
    .select('id, bom_model_id, version_no, effective_from, notes, created_at')
    .eq('bom_model_id', model.id)
    .order('effective_from', { ascending: false });

  if (versionError) {
    throw new Error(`Failed to load BOM versions: ${versionError.message}`);
  }

  const versionList = (versions ?? []) as BomVersionRecord[];
  const versionIds = versionList.map((version) => version.id);
  let linesByVersionId = new Map<string, BomLineRecord[]>();

  if (versionIds.length > 0) {
    const { data: lines, error: lineError } = await supabase
      .from('bom_lines')
      .select(
        'id, bom_version_id, component_item_id, component_sku, component_name, qty_per_fg, unit, sort_order, notes, created_at'
      )
      .in('bom_version_id', versionIds)
      .order('sort_order', { ascending: true })
      .order('component_sku', { ascending: true });

    if (lineError) {
      throw new Error(`Failed to load BOM lines: ${lineError.message}`);
    }

    linesByVersionId = ((lines ?? []) as BomLineRecord[]).reduce((map, line) => {
      const existing = map.get(line.bom_version_id) ?? [];
      existing.push(line);
      map.set(line.bom_version_id, existing);
      return map;
    }, new Map<string, BomLineRecord[]>());
  }

  return {
    model: model as BomModelSummary,
    versions: versionList.map((version) => ({
      ...version,
      lines: linesByVersionId.get(version.id) ?? [],
    })),
  } satisfies BomDetail;
}

export async function getBomVersionById(versionId: string) {
  const supabase = getSupabaseInventoryServerClient();
  const { data: versionRow, error: versionError } = await supabase
    .from('bom_versions')
    .select(
      'id, bom_model_id, version_no, effective_from, notes, created_at, bom_models!inner(id, fg_sku, fg_name, source_item_id, created_at, updated_at)'
    )
    .eq('id', versionId)
    .single();

  if (versionError) {
    throw new Error(`Failed to load BOM version: ${versionError.message}`);
  }

  const relation = Array.isArray(versionRow.bom_models)
    ? versionRow.bom_models[0]
    : versionRow.bom_models;

  if (!relation) {
    throw new Error('BOM model lookup failed.');
  }

  const { data: lines, error: lineError } = await supabase
    .from('bom_lines')
    .select(
      'id, bom_version_id, component_item_id, component_sku, component_name, qty_per_fg, unit, sort_order, notes, created_at'
    )
    .eq('bom_version_id', versionId)
    .order('sort_order', { ascending: true })
    .order('component_sku', { ascending: true });

  if (lineError) {
    throw new Error(`Failed to load BOM lines: ${lineError.message}`);
  }

  return {
    model: relation as BomModelSummary,
    version: {
      id: versionRow.id,
      bom_model_id: versionRow.bom_model_id,
      version_no: versionRow.version_no,
      effective_from: versionRow.effective_from,
      notes: versionRow.notes,
      created_at: versionRow.created_at,
    } satisfies BomVersionRecord,
    lines: (lines ?? []) as BomLineRecord[],
  } satisfies BomVersionLookup;
}

export async function saveBomVersion(
  versionId: string,
  input: {
    effectiveFrom: string;
    notes: string | null;
    lines: BomVersionLineInput[];
  }
) {
  const supabase = getSupabaseInventoryServerClient();
  const versionLookup = await getBomVersionById(versionId);

  const normalizedLines = input.lines.map((line, index) => ({
    component_item_id: line.componentItemId.trim(),
    component_sku: line.componentSku.trim(),
    component_name: line.componentName.trim(),
    qty_per_fg: Number(line.qtyPerFg),
    unit: line.unit?.trim() || null,
    sort_order: index,
    notes: line.notes?.trim() || null,
  }));

  const invalidLine = normalizedLines.find(
    (line) =>
      !line.component_item_id ||
      !line.component_sku ||
      !line.component_name ||
      !Number.isFinite(line.qty_per_fg) ||
      line.qty_per_fg <= 0
  );

  if (invalidLine) {
    throw new Error('Every BOM line needs a component SKU, name, item id, and qty_per_fg > 0.');
  }

  const { error: updateVersionError } = await supabase
    .from('bom_versions')
    .update({
      effective_from: input.effectiveFrom,
      notes: input.notes?.trim() || null,
    })
    .eq('id', versionId);

  if (updateVersionError) {
    throw new Error(updateVersionError.message);
  }

  const { error: deleteLinesError } = await supabase
    .from('bom_lines')
    .delete()
    .eq('bom_version_id', versionId);

  if (deleteLinesError) {
    throw new Error(deleteLinesError.message);
  }

  if (normalizedLines.length > 0) {
    const { error: insertLinesError } = await supabase.from('bom_lines').insert(
      normalizedLines.map((line) => ({
        bom_version_id: versionId,
        ...line,
      }))
    );

    if (insertLinesError) {
      throw new Error(insertLinesError.message);
    }
  }

  const detail = await getBomDetailBySku(versionLookup.model.fg_sku);
  return {
    fgSku: versionLookup.model.fg_sku,
    detail,
  };
}

export async function listComponentItems() {
  const supabase = getSupabaseInventoryServerClient();
  const { data, error } = await supabase
    .from('items')
    .select('id, sku, item_name, default_unit, category')
    .eq('active', true)
    .order('item_name', { ascending: true })
    .limit(2000);

  if (error) {
    throw new Error(`Failed to load component items: ${error.message}`);
  }

  return (data ?? []) as ComponentItemOption[];
}

export async function listBomCatalogItems() {
  const deduped = new Map<string, BomCatalogItem>();
  try {
    const orderPortalCatalog = await listOrderPortalSalesCatalog();

    for (const row of orderPortalCatalog) {
      deduped.set(row.fg_sku, row);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown order portal catalog error';
    console.error('Failed to load order portal sales catalog for BOMs:', message);
  }

  const inventorySupabase = getSupabaseInventoryServerClient();

  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await inventorySupabase
      .from('daily_fg_sales_import')
      .select('fg_sku, fg_name, source_item_id')
      .order('sale_date', { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load local imported sales catalog: ${error.message}`);
    }

    const rows = (data ?? []) as Array<{
      fg_sku: string;
      fg_name: string | null;
      source_item_id: string | null;
    }>;

    for (const row of rows) {
      const normalizedSku = row.fg_sku.trim().toUpperCase();
      if (!normalizedSku) {
        continue;
      }

      const existing = deduped.get(normalizedSku);
      deduped.set(normalizedSku, {
        fg_sku: normalizedSku,
        fg_name: existing?.fg_name || row.fg_name?.trim() || null,
        source_item_id: existing?.source_item_id || row.source_item_id || null,
      });
    }

    if (rows.length < pageSize) {
      break;
    }
  }

  return [...deduped.values()].sort((left, right) => left.fg_sku.localeCompare(right.fg_sku));
}
