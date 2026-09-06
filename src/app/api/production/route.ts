import { NextRequest, NextResponse } from 'next/server';
import {
  createProductionEntry,
  FR_CRUZER_SKU,
  getProductionDashboard,
} from '@/lib/production';

type CreateProductionRequest = {
  fgSku?: string;
  productionDate?: string;
  colorVariant?: string;
  quantity?: number;
  packedQuantity?: number;
  reportReference?: string | null;
  notes?: string | null;
};

function requestErrorStatus(message: string) {
  return /required|choose|whole number|greater than zero|zero or more|enter an assembled|not found|create the model/i.test(
    message
  )
    ? 400
    : 500;
}

export async function GET(request: NextRequest) {
  const fgSku = request.nextUrl.searchParams.get('fgSku')?.trim() || FR_CRUZER_SKU;

  try {
    const dashboard = await getProductionDashboard(fgSku);
    return NextResponse.json({ dashboard }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown production dashboard error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateProductionRequest;
    const entry = await createProductionEntry({
      fgSku: body.fgSku?.trim() || FR_CRUZER_SKU,
      productionDate: body.productionDate?.trim() || '',
      colorVariant: body.colorVariant?.trim() || '',
      quantity: Number(body.quantity),
      packedQuantity: Number(body.packedQuantity ?? 0),
      reportReference: body.reportReference?.trim() || null,
      notes: body.notes?.trim() || null,
    });

    return NextResponse.json({ ok: true, entry }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown production save error';
    return NextResponse.json({ error: message }, { status: requestErrorStatus(message) });
  }
}
