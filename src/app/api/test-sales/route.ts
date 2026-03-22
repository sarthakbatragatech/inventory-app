import { NextResponse } from 'next/server';
import { getSupabaseInventoryClient } from '@/lib/supabaseInventory';

export async function GET() {
  const supabaseInventory = getSupabaseInventoryClient();
  const { data, error } = await supabaseInventory
    .from('daily_fg_sales_import')
    .select('*')
    .order('sale_date', { ascending: false })
    .order('fg_sku', { ascending: true })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    count: data?.length ?? 0,
    data,
  });
}
