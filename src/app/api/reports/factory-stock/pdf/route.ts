import { NextResponse } from 'next/server';
import { generateFactoryStockPdfDocument } from '@/lib/factory-stock-whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { pdfBytes, filename } = await generateFactoryStockPdfDocument();

    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to generate factory stock PDF.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
