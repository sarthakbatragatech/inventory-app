import { NextRequest, NextResponse } from 'next/server';
import { createStockAdjustment } from '@/lib/reconciliation';

type CreateStockAdjustmentRequest = {
  date?: string;
  itemId?: string;
  quantityDelta?: number;
  reason?: string;
  referenceModel?: string | null;
  notes?: string | null;
};

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateStockAdjustmentRequest;
    const date = body.date?.trim() || '';
    const itemId = body.itemId?.trim() || '';
    const quantityDelta = Number(body.quantityDelta);
    const reason = body.reason?.trim() || '';
    const referenceModel = body.referenceModel?.trim() || null;
    const notes = body.notes?.trim() || null;

    if (!date || !isIsoDate(date)) {
      return NextResponse.json(
        { error: 'date is required in YYYY-MM-DD format.' },
        { status: 400 }
      );
    }

    if (!itemId || !isUuid(itemId)) {
      return NextResponse.json({ error: 'A valid itemId is required.' }, { status: 400 });
    }

    if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
      return NextResponse.json(
        { error: 'quantityDelta must be a non-zero number.' },
        { status: 400 }
      );
    }

    if (!reason) {
      return NextResponse.json({ error: 'reason is required.' }, { status: 400 });
    }

    const result = await createStockAdjustment({
      date,
      itemId,
      quantityDelta,
      reason,
      referenceModel,
      notes,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown stock adjustment save error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
