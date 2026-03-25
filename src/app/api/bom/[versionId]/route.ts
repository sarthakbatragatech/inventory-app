import { NextRequest, NextResponse } from 'next/server';
import { saveBomVersion } from '@/lib/bom';

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

    const result = await saveBomVersion(versionId, {
      effectiveFrom,
      notes: body.notes?.trim() || null,
      lines: lines.map((line) => ({
        componentItemId: line.componentItemId?.trim() ?? '',
        componentSku: line.componentSku?.trim() ?? '',
        componentName: line.componentName?.trim() ?? '',
        qtyPerFg: Number(line.qtyPerFg),
        unit: line.unit?.trim() || null,
        notes: line.notes?.trim() || null,
      })),
    });

    return NextResponse.json({
      ok: true,
      detail: result.detail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown BOM update error';
    const status = /qty_per_fg > 0|required/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
