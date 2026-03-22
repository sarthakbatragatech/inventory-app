import { getSupabaseOrderClient } from '@/lib/supabaseOrder';

const ORDER_SALES_PAGE_SIZE = 1000;

type RawItem = {
  id: string;
  code: string | null;
  name: string | null;
  category: string | null;
  company: string | null;
};

type RawOrderLine = {
  item_id: string;
  items: RawItem | RawItem[] | null;
};

type RawDispatchRow = {
  dispatched_at: string;
  dispatched_qty: number | null;
  order_lines: RawOrderLine | RawOrderLine[] | null;
};

export type OrderPortalSalesRow = {
  sale_date: string;
  source_item_id: string | null;
  model_key: string;
  fg_name: string | null;
  category: string | null;
  qty: number;
};

function normalizeModelKey(code: string | null, name: string | null) {
  const normalizedCode = code?.trim().toUpperCase() || '';
  if (normalizedCode) {
    return normalizedCode;
  }

  const normalizedName = name?.trim() || '';
  return normalizedName.toUpperCase();
}

function getFirstOrderLine(orderLines: RawDispatchRow['order_lines']) {
  if (!orderLines) {
    return null;
  }

  return Array.isArray(orderLines) ? orderLines[0] ?? null : orderLines;
}

function getFirstItem(orderLine: RawOrderLine | null) {
  if (!orderLine?.items) {
    return null;
  }

  return Array.isArray(orderLine.items) ? orderLine.items[0] ?? null : orderLine.items;
}

export async function listOrderPortalSales(window?: {
  startDate: string;
  endDate: string;
}) {
  const aggregated = new Map<string, OrderPortalSalesRow>();
  const supabaseOrder = getSupabaseOrderClient();

  for (let from = 0; ; from += ORDER_SALES_PAGE_SIZE) {
    const to = from + ORDER_SALES_PAGE_SIZE - 1;
    let query = supabaseOrder
      .from('dispatch_events')
      .select(
        'dispatched_at, dispatched_qty, order_lines!inner(item_id, items!inner(id, code, name, category, company))'
      )
      .order('dispatched_at', { ascending: true })
      .range(from, to);

    if (window) {
      query = query
        .gte('dispatched_at', window.startDate)
        .lte('dispatched_at', window.endDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Order portal sales fetch failed: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as RawDispatchRow[];

    for (const row of rows) {
      const orderLine = getFirstOrderLine(row.order_lines);
      const item = getFirstItem(orderLine);
      if (!item) {
        continue;
      }

      if (item.category === 'spare' || item.company !== 'Tycoon') {
        continue;
      }

      const modelKey = normalizeModelKey(item.code, item.name);
      if (!modelKey) {
        continue;
      }

      const saleDate = row.dispatched_at;
      const dispatchedQty = Number(row.dispatched_qty ?? 0);
      if (!Number.isFinite(dispatchedQty) || dispatchedQty <= 0) {
        continue;
      }

      const aggregateKey = `${saleDate}::${modelKey}`;
      const existing = aggregated.get(aggregateKey);

      if (existing) {
        existing.qty += dispatchedQty;
        continue;
      }

      aggregated.set(aggregateKey, {
        sale_date: saleDate,
        source_item_id: item.id ?? orderLine?.item_id ?? null,
        model_key: modelKey,
        fg_name: item.name?.trim() || null,
        category: item.category,
        qty: dispatchedQty,
      });
    }

    if (rows.length < ORDER_SALES_PAGE_SIZE) {
      break;
    }
  }

  return [...aggregated.values()].sort((left, right) => {
    if (left.sale_date !== right.sale_date) {
      return left.sale_date.localeCompare(right.sale_date);
    }

    return left.model_key.localeCompare(right.model_key);
  });
}

export async function listOrderPortalSalesCatalog() {
  const rows = await listOrderPortalSales();
  const deduped = new Map<
    string,
    { fg_sku: string; fg_name: string | null; source_item_id: string | null }
  >();

  for (const row of rows) {
    const existing = deduped.get(row.model_key);
    deduped.set(row.model_key, {
      fg_sku: row.model_key,
      fg_name: existing?.fg_name || row.fg_name,
      source_item_id: existing?.source_item_id || row.source_item_id,
    });
  }

  return [...deduped.values()].sort((left, right) => left.fg_sku.localeCompare(right.fg_sku));
}
