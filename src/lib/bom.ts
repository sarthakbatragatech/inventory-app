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
