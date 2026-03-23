import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';
import { normalizeItemName } from '@/lib/sku-normalizer';

type UpdateItemRequest = {
  sku?: string;
  itemName?: string;
  family?: string;
  category?: string;
};

const VALID_CATEGORIES = new Set([
  'plastic_part',
  'electronic',
  'metal_part',
  'packaging',
  'raw_material',
]);

type FamilyOptionRecord = {
  code: string;
  name: string | null;
};

type FamilyLinkRecord = {
  family_code: string;
  is_primary: boolean | null;
};

export async function GET(
  _request: NextRequest,
  context: RouteContext<'/api/items/[id]'>
) {
  const { id } = await context.params;
  const supabase = getSupabaseServerClient();

  const { data: item, error: itemError } = await supabase
    .from('items')
    .select('id, sku, item_name, family, category')
    .eq('id', id)
    .maybeSingle();

  if (itemError) {
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  if (!item) {
    return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  }

  const [{ data: familyOptionsData, error: familyOptionsError }, { data: familyLinks, error: familyLinksError }] =
    await Promise.all([
      supabase.from('item_families').select('code, name').order('code', { ascending: true }),
      supabase
        .from('item_family_links')
        .select('family_code, is_primary')
        .eq('item_id', id),
    ]);

  if (familyOptionsError) {
    return NextResponse.json({ error: familyOptionsError.message }, { status: 500 });
  }

  if (
    familyLinksError &&
    !['PGRST205', '42P01'].includes(familyLinksError.code || '') &&
    !familyLinksError.message.includes('does not exist')
  ) {
    return NextResponse.json({ error: familyLinksError.message }, { status: 500 });
  }

  const linkList = ((familyLinks ?? []) as FamilyLinkRecord[]).map((link) => link.family_code);
  const primaryFamily =
    ((familyLinks ?? []) as FamilyLinkRecord[]).find((link) => link.is_primary)?.family_code ??
    linkList[0] ??
    item.family ??
    '';

  return NextResponse.json({
    item: {
      id: String(item.id),
      sku: String(item.sku),
      itemName: String(item.item_name),
      family: primaryFamily,
      category: String(item.category ?? 'raw_material'),
    },
    familyOptions: ((familyOptionsData ?? []) as FamilyOptionRecord[]).map((option) => ({
      code: String(option.code),
      name: option.name === null ? null : String(option.name),
    })),
    categoryOptions: Array.from(VALID_CATEGORIES),
  });
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext<'/api/items/[id]'>
) {
  const { id } = await context.params;

  try {
    const body = (await request.json()) as UpdateItemRequest;
    const sku = body.sku?.trim() ?? '';
    const itemName = body.itemName?.trim() ?? '';
    const family = body.family?.trim() || null;
    const category = body.category?.trim() ?? '';

    if (!sku) {
      return NextResponse.json({ error: 'SKU is required.' }, { status: 400 });
    }

    if (!itemName) {
      return NextResponse.json({ error: 'Item name is required.' }, { status: 400 });
    }

    if (!VALID_CATEGORIES.has(category)) {
      return NextResponse.json({ error: 'Category is invalid.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const { data: currentItem, error: currentItemError } = await supabase
      .from('items')
      .select('id, sku, item_name')
      .eq('id', id)
      .maybeSingle();

    if (currentItemError) {
      return NextResponse.json({ error: currentItemError.message }, { status: 500 });
    }

    if (!currentItem) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
    }

    const { data: duplicateSku, error: duplicateSkuError } = await supabase
      .from('items')
      .select('id')
      .eq('sku', sku)
      .neq('id', id)
      .maybeSingle();

    if (duplicateSkuError) {
      return NextResponse.json({ error: duplicateSkuError.message }, { status: 500 });
    }

    if (duplicateSku) {
      return NextResponse.json({ error: 'That SKU already exists.' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('items')
      .update({
        sku,
        item_name: itemName,
        normalized_name: normalizeItemName(itemName),
        family,
        category,
      })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (currentItem.sku !== sku || currentItem.item_name !== itemName) {
      const { error: bomLineUpdateError } = await supabase
        .from('bom_lines')
        .update({
          component_sku: sku,
          component_name: itemName,
        })
        .eq('component_item_id', id);

      if (bomLineUpdateError) {
        return NextResponse.json({ error: bomLineUpdateError.message }, { status: 500 });
      }
    }

    const { error: clearPrimaryError } = await supabase
      .from('item_family_links')
      .update({ is_primary: false })
      .eq('item_id', id);

    if (
      clearPrimaryError &&
      !['PGRST205', '42P01'].includes(clearPrimaryError.code || '') &&
      !clearPrimaryError.message.includes('does not exist')
    ) {
      return NextResponse.json({ error: clearPrimaryError.message }, { status: 500 });
    }

    if (family) {
      const { error: familyLinkError } = await supabase
        .from('item_family_links')
        .upsert(
          {
            item_id: id,
            family_code: family,
            is_primary: true,
          },
          { onConflict: 'item_id,family_code' }
        );

      if (
        familyLinkError &&
        !['PGRST205', '42P01'].includes(familyLinkError.code || '') &&
        !familyLinkError.message.includes('does not exist')
      ) {
        return NextResponse.json({ error: familyLinkError.message }, { status: 500 });
      }
    }

    if (currentItem.item_name !== itemName) {
      const aliasesToRemove = [currentItem.item_name, itemName]
        .map((value) => value.trim())
        .filter(Boolean);

      if (aliasesToRemove.length) {
        const { error: aliasCleanupError } = await supabase
          .from('item_aliases')
          .delete()
          .eq('item_id', id)
          .in('alias', aliasesToRemove);

        if (aliasCleanupError) {
          return NextResponse.json({ error: aliasCleanupError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown item update error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
