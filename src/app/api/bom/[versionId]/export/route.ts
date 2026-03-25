import { NextResponse } from 'next/server';
import { serializeBomCsv } from '@/lib/bom-csv';
import { getBomVersionById } from '@/lib/bom';

function buildFileName(fgSku: string, versionNo: number) {
  const safeSku = fgSku.replaceAll(/[^A-Z0-9]+/gi, '-').replaceAll(/^-+|-+$/g, '');
  return `${safeSku || 'bom'}-v${versionNo}.csv`;
}

export async function GET(
  _request: Request,
  context: RouteContext<'/api/bom/[versionId]/export'>
) {
  const { versionId } = await context.params;

  try {
    const versionLookup = await getBomVersionById(versionId);
    const csv = serializeBomCsv(versionLookup.lines);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${buildFileName(
          versionLookup.model.fg_sku,
          versionLookup.version.version_no
        )}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown BOM export error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
