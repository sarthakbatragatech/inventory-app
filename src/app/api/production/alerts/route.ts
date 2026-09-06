import { NextRequest, NextResponse } from 'next/server';
import { FR_CRUZER_SKU, getProductionDashboard } from '@/lib/production';
import { buildProductionAlertPreview } from '@/lib/production-alerts';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const fgSku = (
    request.nextUrl.searchParams.get('fgSku')?.trim() || FR_CRUZER_SKU
  ).toUpperCase();
  const headers = { 'Cache-Control': 'private, no-store' };

  if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(fgSku)) {
    return NextResponse.json(
      { error: 'Enter a valid finished-good SKU.' },
      { status: 400, headers }
    );
  }

  try {
    const dashboard = await getProductionDashboard(fgSku);
    if (!dashboard.bomModelId) {
      return NextResponse.json(
        { error: 'Production model not found.' },
        { status: 404, headers }
      );
    }

    return NextResponse.json(
      { alerts: buildProductionAlertPreview(dashboard) },
      { headers }
    );
  } catch {
    return NextResponse.json(
      { error: 'Unable to prepare the alert preview. Please try again.' },
      { status: 503, headers }
    );
  }
}
