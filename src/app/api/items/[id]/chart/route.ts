import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';

type BatchRecord = {
  id: string;
  file_name: string;
};

type ImportRowRecord = {
  quantity: number | null;
  inward_date: string | null;
  unit: string | null;
};

function normalizeDisplayUnit(unit: string | null): string | null {
  if (!unit) {
    return null;
  }

  if (unit === 'KGS' || unit === 'kg') {
    return 'kg';
  }

  if (unit === 'PCS' || unit === 'pcs') {
    return 'pcs';
  }

  return unit.toLowerCase();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !isUuid(id)) {
    return NextResponse.json({ error: `invalid item id: ${id || 'missing'}` }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data: batches, error: batchError } = await supabase
    .from('import_batches')
    .select('id, file_name')
    .eq('status', 'processed')
    .order('uploaded_at', { ascending: false });

  if (batchError) {
    return NextResponse.json({ error: batchError.message }, { status: 500 });
  }

  const latestBatchIds = [
    ...new Map(
      ((batches ?? []) as BatchRecord[]).map((batch) => [batch.file_name, batch])
    ).values(),
  ].map((batch) => batch.id);

  if (!latestBatchIds.length) {
    return NextResponse.json({ points: [] });
  }

  const importRows: ImportRowRecord[] = [];

  for (let index = 0; index < latestBatchIds.length; index += 100) {
    const batchChunk = latestBatchIds.slice(index, index + 100);
    const { data, error } = await supabase
      .from('import_batch_rows')
      .select('quantity, inward_date, unit')
      .eq('item_id', id)
      .in('batch_id', batchChunk);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    importRows.push(...((data ?? []) as ImportRowRecord[]));
  }

  const pointsByDate = new Map<
    string,
    { totalQuantity: number; unitCounts: Record<string, number>; entryCount: number }
  >();

  for (const row of importRows) {
    if (!row.inward_date || row.quantity === null || row.quantity === undefined) {
      continue;
    }

    const normalizedUnit = normalizeDisplayUnit(row.unit);
    const existing = pointsByDate.get(row.inward_date) ?? {
      totalQuantity: 0,
      unitCounts: {},
      entryCount: 0,
    };

    existing.totalQuantity += row.quantity;
    existing.entryCount += 1;
    if (normalizedUnit) {
      existing.unitCounts[normalizedUnit] =
        (existing.unitCounts[normalizedUnit] ?? 0) + 1;
    }

    pointsByDate.set(row.inward_date, existing);
  }

  const points = [...pointsByDate.entries()]
    .sort(([left], [right]) => new Date(left).getTime() - new Date(right).getTime())
    .map(([inwardDate, point]) => {
      const units = Object.entries(point.unitCounts).sort((left, right) => right[1] - left[1]);

      return {
        inwardDate,
        totalQuantity: point.totalQuantity,
        unit: units.length === 1 ? units[0][0] : null,
        entryCount: point.entryCount,
      };
    });

  if (points.length) {
    const today = new Date().toISOString().slice(0, 10);
    const lastPoint = points[points.length - 1];

    if (lastPoint.inwardDate < today) {
      points.push({
        inwardDate: today,
        totalQuantity: 0,
        unit: lastPoint.unit,
        entryCount: 0,
      });
    }
  }

  return NextResponse.json({ points });
}
