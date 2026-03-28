import { getSupabaseOrderClient } from '@/lib/supabaseOrder';

const ORDER_PENDING_PAGE_SIZE = 1000;
const OPEN_ORDER_STATUSES = new Set(['submitted', 'partially_dispatched']);

type RawItem = {
  id: string;
  code: string | null;
  name: string | null;
  category: string | null;
  company: string | null;
};

type RawOrder = {
  status: string | null;
  order_date: string | null;
  expected_dispatch_date: string | null;
};

type RawOrderLine = {
  item_id: string;
  qty: number | null;
  dispatched_qty: number | null;
  items: RawItem | RawItem[] | null;
  orders: RawOrder | RawOrder[] | null;
};

export type OrderPortalPendingRow = {
  reference_date: string;
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

function getFirstRelatedRecord<T>(value: T | T[] | null) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? value[0] ?? null : value;
}

function resolveReferenceDate(order: RawOrder | null) {
  const expectedDispatchDate = order?.expected_dispatch_date?.trim() || '';
  if (expectedDispatchDate) {
    return expectedDispatchDate;
  }

  const orderDate = order?.order_date?.trim() || '';
  return orderDate || null;
}

export async function listOrderPortalPendingOrders() {
  const aggregated = new Map<string, OrderPortalPendingRow>();
  const supabaseOrder = getSupabaseOrderClient();

  for (let from = 0; ; from += ORDER_PENDING_PAGE_SIZE) {
    const to = from + ORDER_PENDING_PAGE_SIZE - 1;
    const { data, error } = await supabaseOrder
      .from('order_lines')
      .select(
        'item_id, qty, dispatched_qty, items!inner(id, code, name, category, company), orders!inner(status, order_date, expected_dispatch_date)'
      )
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Order portal pending orders fetch failed: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as RawOrderLine[];

    for (const row of rows) {
      const item = getFirstRelatedRecord(row.items);
      const order = getFirstRelatedRecord(row.orders);

      if (!item) {
        continue;
      }

      if (!OPEN_ORDER_STATUSES.has(order?.status?.trim() || '')) {
        continue;
      }

      if (item.category === 'spare' || item.company !== 'Tycoon') {
        continue;
      }

      const pendingQty = Math.max(
        Number(row.qty ?? 0) - Number(row.dispatched_qty ?? 0),
        0
      );

      if (!Number.isFinite(pendingQty) || pendingQty <= 0) {
        continue;
      }

      const modelKey = normalizeModelKey(item.code, item.name);
      const referenceDate = resolveReferenceDate(order);

      if (!modelKey || !referenceDate) {
        continue;
      }

      const aggregateKey = `${referenceDate}::${modelKey}`;
      const existing = aggregated.get(aggregateKey);

      if (existing) {
        existing.qty += pendingQty;
        continue;
      }

      aggregated.set(aggregateKey, {
        reference_date: referenceDate,
        source_item_id: item.id ?? row.item_id ?? null,
        model_key: modelKey,
        fg_name: item.name?.trim() || null,
        category: item.category,
        qty: pendingQty,
      });
    }

    if (rows.length < ORDER_PENDING_PAGE_SIZE) {
      break;
    }
  }

  return [...aggregated.values()].sort((left, right) => {
    if (left.reference_date !== right.reference_date) {
      return left.reference_date.localeCompare(right.reference_date);
    }

    return left.model_key.localeCompare(right.model_key);
  });
}
