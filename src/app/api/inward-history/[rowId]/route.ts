import { NextRequest, NextResponse } from 'next/server';
import { normalizeItemName } from '@/lib/sku-normalizer';
import { getSupabaseServerClient } from '@/lib/supabase';

type UpdateInwardHistoryRequest = {
  itemId?: string;
  rawItemName?: string;
  inwardDate?: string;
  quantity?: number;
  unit?: string | null;
  color?: string | null;
  persistAlias?: boolean;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeStoredUnit(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (/^pcs?$/i.test(normalized)) {
    return 'PCS';
  }

  if (/^kgs?$/i.test(normalized) || /^kg$/i.test(normalized)) {
    return 'KGS';
  }

  return normalized.toUpperCase();
}

export async function PUT(
  request: NextRequest,
  context: RouteContext<'/api/inward-history/[rowId]'>
) {
  const { rowId } = await context.params;

  if (!rowId || !isUuid(rowId)) {
    return NextResponse.json({ error: 'Invalid inward-history row id.' }, { status: 400 });
  }

  try {
    const body = (await request.json()) as UpdateInwardHistoryRequest;
    const itemId = body.itemId?.trim() ?? '';
    const rawItemName = body.rawItemName?.trim() ?? '';
    const inwardDate = body.inwardDate?.trim() ?? '';
    const quantity = Number(body.quantity);
    const unit = normalizeStoredUnit(body.unit);
    const color = body.color?.trim() || null;
    const persistAlias = Boolean(body.persistAlias);

    if (!itemId || !isUuid(itemId)) {
      return NextResponse.json({ error: 'A valid SKU selection is required.' }, { status: 400 });
    }

    if (!rawItemName) {
      return NextResponse.json({ error: 'Imported As is required.' }, { status: 400 });
    }

    if (!inwardDate || !isIsoDate(inwardDate)) {
      return NextResponse.json(
        { error: 'Inward date is required in YYYY-MM-DD format.' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: 'Quantity must be greater than 0.' }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const [{ data: row, error: rowError }, { data: item, error: itemError }] =
      await Promise.all([
        supabase
          .from('import_batch_rows')
          .select('id, item_id')
          .eq('id', rowId)
          .maybeSingle(),
        supabase
          .from('items')
          .select('id, sku, item_name, active')
          .eq('id', itemId)
          .eq('active', true)
          .maybeSingle(),
      ]);

    if (rowError) {
      return NextResponse.json({ error: rowError.message }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({ error: 'Inward-history row not found.' }, { status: 404 });
    }

    if (itemError) {
      return NextResponse.json({ error: itemError.message }, { status: 500 });
    }

    if (!item) {
      return NextResponse.json({ error: 'Selected SKU was not found.' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('import_batch_rows')
      .update({
        item_id: itemId,
        raw_item_name: rawItemName,
        normalized_item_name: normalizeItemName(rawItemName),
        inward_date: inwardDate,
        quantity,
        unit,
        color,
      })
      .eq('id', rowId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (persistAlias) {
      const { error: removeAliasError } = await supabase
        .from('item_aliases')
        .delete()
        .eq('alias', rawItemName)
        .neq('item_id', itemId);

      if (removeAliasError) {
        return NextResponse.json({ error: removeAliasError.message }, { status: 500 });
      }

      const { error: aliasUpsertError } = await supabase
        .from('item_aliases')
        .upsert(
          {
            item_id: itemId,
            alias: rawItemName,
            source: 'manual',
            confidence: 1,
          },
          { onConflict: 'item_id,alias' }
        );

      if (aliasUpsertError) {
        return NextResponse.json({ error: aliasUpsertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      itemId: itemId,
      previousItemId: row.item_id,
      aliasUpdated: persistAlias,
      item: {
        id: item.id,
        sku: item.sku,
        itemName: item.item_name,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown inward-history update error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
