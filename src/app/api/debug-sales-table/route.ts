import { NextResponse } from 'next/server';
import { supabaseOrder } from '@/lib/supabaseOrder';

export async function GET() {
  try {
    const [headCount, latestRows, earliestRows] = await Promise.all([
      supabaseOrder
        .from('daily_fg_sales')
        .select('sale_date', { count: 'exact', head: true }),
      supabaseOrder
        .from('daily_fg_sales')
        .select('sale_date, fg_sku, fg_name, qty')
        .order('sale_date', { ascending: false })
        .limit(20),
      supabaseOrder
        .from('daily_fg_sales')
        .select('sale_date, fg_sku, fg_name, qty')
        .order('sale_date', { ascending: true })
        .limit(20),
    ]);

    const firstError =
      headCount.error ?? latestRows.error ?? earliestRows.error ?? null;

    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      visibleRowCount: headCount.count ?? null,
      latestRows: latestRows.data ?? [],
      earliestRows: earliestRows.data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown debug-sales-table error';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
