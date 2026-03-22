import { NextResponse } from 'next/server';
import { supabaseOrder } from '@/lib/supabaseOrder';

const PAGE_SIZE = 1000;

export async function GET() {
  try {
    const distinctSkus = new Set<string>();
    let totalRows = 0;

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabaseOrder
        .from('daily_fg_sales')
        .select('fg_sku')
        .order('sale_date', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw new Error(error.message);
      }

      const rows = data ?? [];
      totalRows += rows.length;

      for (const row of rows) {
        const sku = String(row.fg_sku || '').trim().toUpperCase();
        if (sku) {
          distinctSkus.add(sku);
        }
      }

      if (rows.length < PAGE_SIZE) {
        break;
      }
    }

    return NextResponse.json({
      ok: true,
      totalRows,
      distinctFgSkuCount: distinctSkus.size,
      sampleFgSkus: [...distinctSkus].sort().slice(0, 50),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown debug-sales-summary error';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
