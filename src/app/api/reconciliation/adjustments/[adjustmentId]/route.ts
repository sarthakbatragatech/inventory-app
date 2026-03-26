import { NextRequest, NextResponse } from 'next/server';
import { deleteStockAdjustment } from '@/lib/reconciliation';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext<'/api/reconciliation/adjustments/[adjustmentId]'>
) {
  const { adjustmentId } = await context.params;

  if (!adjustmentId || !isUuid(adjustmentId)) {
    return NextResponse.json({ error: 'Invalid stock adjustment id.' }, { status: 400 });
  }

  try {
    const result = await deleteStockAdjustment(adjustmentId);
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown stock adjustment delete error';
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
