import { NextResponse } from 'next/server';
import { deleteProductionEntry } from '@/lib/production';

export async function DELETE(
  _request: Request,
  context: RouteContext<'/api/production/[entryId]'>
) {
  const { entryId } = await context.params;

  try {
    const deletedEntryId = await deleteProductionEntry(entryId);
    return NextResponse.json({ ok: true, deletedEntryId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown production delete error';
    const status = /required|not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
