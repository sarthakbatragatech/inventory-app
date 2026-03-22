import { NextRequest, NextResponse } from 'next/server';
import { getBomDetailBySku } from '@/lib/bom';
import { getSupabaseInventoryServerClient } from '@/lib/supabase';

type UpdateBomVersionRequest = {
  effectiveFrom?: string;
  notes?: string | null;
  lines?: Array<{
    componentItemId?: string;
    componentSku?: string;
    componentName?: string;
    qtyPerFg?: number;
    unit?: string | null;
    notes?: string | null;
  }>;
};

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function PUT(
  request: NextRequest,
  context: RouteContext<'/api/bom/[versionId]'>
) {
  const { versionId } = await context.params;

  try {
    const body = (await request.json()) as UpdateBomVersionRequest;
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const effectiveFrom = body.effectiveFrom?.trim() ?? '';

    if (!effectiveFrom || !isIsoDate(effectiveFrom)) {
      return NextResponse.json(
        { error: 'effectiveFrom is required in YYYY-MM-DD format.' },
        { status: 400 }
      );
    }

    const normalizedLines = lines.map((line, index) => ({
      component_item_id: line.componentItemId?.trim() ?? '',
      component_sku: line.componentSku?.trim() ?? '',
      component_name: line.componentName?.trim() ?? '',
      qty_per_fg: Number(line.qtyPerFg),
      unit: line.unit?.trim() || null,
      sort_order: index,
      notes: line.notes?.trim() || null,
    }));

    const invalidLine = normalizedLines.find(
      (line) =>
        !line.component_item_id ||
        !line.component_sku ||
        !line.component_name ||
        !Number.isFinite(line.qty_per_fg) ||
        line.qty_per_fg <= 0
    );

    if (invalidLine) {
      return NextResponse.json(
        { error: 'Every BOM line needs a component SKU, name, item id, and qty_per_fg > 0.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseInventoryServerClient();
    const { data: version, error: versionError } = await supabase
      .from('bom_versions')
      .select('id, bom_model_id, bom_models!inner(fg_sku)')
      .eq('id', versionId)
      .single();

    if (versionError) {
      return NextResponse.json({ error: versionError.message }, { status: 500 });
    }

    const fgSku = (version.bom_models as { fg_sku: string }).fg_sku;

    const { error: updateVersionError } = await supabase
      .from('bom_versions')
      .update({
        effective_from: effectiveFrom,
        notes: body.notes?.trim() || null,
      })
      .eq('id', versionId);

    if (updateVersionError) {
      return NextResponse.json({ error: updateVersionError.message }, { status: 500 });
    }

    const { error: deleteLinesError } = await supabase
      .from('bom_lines')
      .delete()
      .eq('bom_version_id', versionId);

    if (deleteLinesError) {
      return NextResponse.json({ error: deleteLinesError.message }, { status: 500 });
    }

    if (normalizedLines.length > 0) {
      const { error: insertLinesError } = await supabase.from('bom_lines').insert(
        normalizedLines.map((line) => ({
          bom_version_id: versionId,
          ...line,
        }))
      );

      if (insertLinesError) {
        return NextResponse.json({ error: insertLinesError.message }, { status: 500 });
      }
    }

    const detail = await getBomDetailBySku(fgSku);

    return NextResponse.json({
      ok: true,
      detail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown BOM update error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
