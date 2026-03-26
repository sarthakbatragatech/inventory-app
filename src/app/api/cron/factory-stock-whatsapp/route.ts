import { NextRequest, NextResponse } from 'next/server';
import { sendFactoryStockReportViaWhatsApp } from '@/lib/factory-stock-whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    throw new Error('Missing required environment variable: CRON_SECRET');
  }

  const authorization = request.headers.get('authorization');
  return authorization === `Bearer ${cronSecret}`;
}

async function handleTrigger(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await sendFactoryStockReportViaWhatsApp();

    return NextResponse.json({
      ok: true,
      filename: result.filename,
      generatedAt: result.report.generatedAt,
      totalItemCount: result.report.totalItemCount,
      negativeItemCount: result.report.negativeItemCount,
      reorderItemCount: result.report.reorderItemCount,
      mediaId: result.delivery.mediaId,
      messageId: result.delivery.messageId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to send factory stock WhatsApp report.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleTrigger(request);
}

export async function POST(request: NextRequest) {
  return handleTrigger(request);
}
