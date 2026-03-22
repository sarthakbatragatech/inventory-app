import { NextRequest, NextResponse } from 'next/server';
import { getBomDetailBySku, listBomModels } from '@/lib/bom';
import { getSupabaseInventoryServerClient } from '@/lib/supabase';

type CreateBomVersionRequest = {
  fgSku?: string;
  fgName?: string | null;
  sourceItemId?: string | null;
  effectiveFrom?: string;
  notes?: string | null;
};

function normalizeFgSku(value: string) {
  return value.trim().toUpperCase();
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function resolveLocalSourceItemId(
  sourceItemId: string | null | undefined
) {
  const normalizedSourceItemId = sourceItemId?.trim() || null;
  if (!normalizedSourceItemId) {
    return null;
  }

  const supabase = getSupabaseInventoryServerClient();
  const { data, error } = await supabase
    .from('items')
    .select('id')
    .eq('id', normalizedSourceItemId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to validate source item id: ${error.message}`);
  }

  return data?.id ?? null;
}

export async function GET(request: NextRequest) {
  const fgSku = request.nextUrl.searchParams.get('fgSku')?.trim().toUpperCase();

  try {
    if (fgSku) {
      const detail = await getBomDetailBySku(fgSku);

      return NextResponse.json({
        detail,
      });
    }

    const models = await listBomModels();
    return NextResponse.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown BOM load error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBomVersionRequest;
    const fgSku = normalizeFgSku(body.fgSku ?? '');
    const effectiveFrom = body.effectiveFrom?.trim() ?? '';

    if (!fgSku) {
      return NextResponse.json({ error: 'fgSku is required.' }, { status: 400 });
    }

    if (!effectiveFrom || !isIsoDate(effectiveFrom)) {
      return NextResponse.json(
        { error: 'effectiveFrom is required in YYYY-MM-DD format.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseInventoryServerClient();
    const localSourceItemId = await resolveLocalSourceItemId(body.sourceItemId);
    const { data: existingModel, error: modelError } = await supabase
      .from('bom_models')
      .select('id, fg_sku, fg_name, source_item_id')
      .eq('fg_sku', fgSku)
      .maybeSingle();

    if (modelError) {
      return NextResponse.json({ error: modelError.message }, { status: 500 });
    }

    let modelId = existingModel?.id ?? null;

    if (!modelId) {
      const { data: insertedModel, error: insertModelError } = await supabase
        .from('bom_models')
        .insert({
          fg_sku: fgSku,
          fg_name: body.fgName?.trim() || null,
          source_item_id: localSourceItemId,
        })
        .select('id')
        .single();

      if (insertModelError) {
        return NextResponse.json({ error: insertModelError.message }, { status: 500 });
      }

      modelId = insertedModel.id;
    } else {
      const { error: updateModelError } = await supabase
        .from('bom_models')
        .update({
          fg_name: body.fgName?.trim() || existingModel.fg_name || null,
          source_item_id: localSourceItemId || existingModel.source_item_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', modelId);

      if (updateModelError) {
        return NextResponse.json({ error: updateModelError.message }, { status: 500 });
      }
    }

    const { data: versions, error: versionError } = await supabase
      .from('bom_versions')
      .select('version_no')
      .eq('bom_model_id', modelId)
      .order('version_no', { ascending: false })
      .limit(1);

    if (versionError) {
      return NextResponse.json({ error: versionError.message }, { status: 500 });
    }

    const nextVersionNo = ((versions ?? [])[0]?.version_no ?? 0) + 1;

    const { data: insertedVersion, error: insertVersionError } = await supabase
      .from('bom_versions')
      .insert({
        bom_model_id: modelId,
        version_no: nextVersionNo,
        effective_from: effectiveFrom,
        notes: body.notes?.trim() || null,
      })
      .select('id')
      .single();

    if (insertVersionError) {
      return NextResponse.json({ error: insertVersionError.message }, { status: 500 });
    }

    const detail = await getBomDetailBySku(fgSku);

    return NextResponse.json({
      ok: true,
      versionId: insertedVersion.id,
      detail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown BOM create error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
