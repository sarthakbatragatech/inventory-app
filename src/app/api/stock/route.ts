import { NextRequest, NextResponse } from 'next/server';
import { filterStockListItems, getStockListItems } from '@/lib/stock';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim().toLowerCase() || '';
  const familyFilter = searchParams.get('family')?.trim() || '';
  const categoryFilter = searchParams.get('category')?.trim() || '';

  try {
    const items = await getStockListItems();

    const familyOptions = [
      ...new Set(
        items
          .flatMap((item) => item.families)
          .filter((family): family is string => Boolean(family))
      ),
    ].sort((left, right) => left.localeCompare(right));

    const categoryOptions = [
      ...new Set(
        items
          .map((item) => item.category)
          .filter((category): category is string => Boolean(category))
      ),
    ].sort((left, right) => left.localeCompare(right));

    const filteredItems = filterStockListItems(items, {
      q,
      family: familyFilter,
      category: categoryFilter,
    });

    return NextResponse.json({
      items: filteredItems,
      familyOptions,
      categoryOptions,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to build stock response';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
