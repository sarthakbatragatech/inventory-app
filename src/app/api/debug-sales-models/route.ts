import { NextRequest, NextResponse } from 'next/server';
import { supabaseOrder } from '@/lib/supabaseOrder';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (!q) {
    return NextResponse.json(
      { error: 'Missing q query parameter.' },
      { status: 400 }
    );
  }

  const [exactSku, skuLike, nameLike] = await Promise.all([
    supabaseOrder
      .from('daily_fg_sales')
      .select('fg_sku, fg_name, sale_date, qty')
      .eq('fg_sku', q)
      .order('sale_date', { ascending: false })
      .limit(20),
    supabaseOrder
      .from('daily_fg_sales')
      .select('fg_sku, fg_name, sale_date, qty')
      .ilike('fg_sku', `%${q}%`)
      .order('sale_date', { ascending: false })
      .limit(20),
    supabaseOrder
      .from('daily_fg_sales')
      .select('fg_sku, fg_name, sale_date, qty')
      .ilike('fg_name', `%${q}%`)
      .order('sale_date', { ascending: false })
      .limit(20),
  ]);

  const firstError =
    exactSku.error ?? skuLike.error ?? nameLike.error ?? null;

  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    query: q,
    exactSku: exactSku.data ?? [],
    skuLike: skuLike.data ?? [],
    nameLike: nameLike.data ?? [],
  });
}
