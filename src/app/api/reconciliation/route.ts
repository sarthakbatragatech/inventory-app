import { NextRequest, NextResponse } from 'next/server';
import { listReconciliationItems, saveReconciliationCounts } from '@/lib/reconciliation';

type SaveReconciliationRequest = {
  date?: string;
  counts?: Array<{
    itemId?: string;
    physicalQty?: number | null;
    notes?: string | null;
  }>;
};

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date')?.trim() || '';
  const q = request.nextUrl.searchParams.get('q')?.trim() || '';
  const family = request.nextUrl.searchParams.get('family')?.trim() || '';
  const category = request.nextUrl.searchParams.get('category')?.trim() || '';

  if (!date || !isIsoDate(date)) {
    return NextResponse.json({ error: 'date is required in YYYY-MM-DD format.' }, { status: 400 });
  }

  try {
    const result = await listReconciliationItems({ date, q, family, category });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown reconciliation load error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SaveReconciliationRequest;
    const date = body.date?.trim() || '';
    const counts = Array.isArray(body.counts) ? body.counts : [];

    if (!date || !isIsoDate(date)) {
      return NextResponse.json(
        { error: 'date is required in YYYY-MM-DD format.' },
        { status: 400 }
      );
    }

    const invalidRow = counts.find((row) => {
      if (!row.itemId?.trim()) {
        return true;
      }

      if (row.physicalQty === null || row.physicalQty === undefined) {
        return false;
      }

      return !Number.isFinite(Number(row.physicalQty)) || Number(row.physicalQty) < 0;
    });

    if (invalidRow) {
      return NextResponse.json(
        { error: 'Each reconciliation row needs an itemId and a physicalQty >= 0.' },
        { status: 400 }
      );
    }

    const result = await saveReconciliationCounts(
      date,
      counts.map((row) => ({
        itemId: row.itemId!.trim(),
        physicalQty:
          row.physicalQty === null || row.physicalQty === undefined
            ? null
            : Number(row.physicalQty),
        notes: row.notes?.trim() || null,
      }))
    );

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown reconciliation save error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
