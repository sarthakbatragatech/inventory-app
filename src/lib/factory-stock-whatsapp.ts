import { buildFactoryStockPdf } from '@/lib/factory-stock-pdf';
import { buildFactoryStockReport } from '@/lib/factory-stock-report';
import { sendWhatsAppDocument } from '@/lib/whatsapp-cloud';

function buildFilename(generatedAt: string) {
  const date = generatedAt.slice(0, 10);
  return `factory-stock-${date}.pdf`;
}

function buildCaption(generatedAt: string) {
  const reportDate = new Date(generatedAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return `Factory stock report for ${reportDate}`;
}

export async function generateFactoryStockPdfDocument() {
  const report = await buildFactoryStockReport();
  const pdfBytes = await buildFactoryStockPdf(report);

  return {
    report,
    pdfBytes,
    filename: buildFilename(report.generatedAt),
    caption: buildCaption(report.generatedAt),
  };
}

export async function sendFactoryStockReportViaWhatsApp() {
  const document = await generateFactoryStockPdfDocument();
  const delivery = await sendWhatsAppDocument({
    pdfBytes: document.pdfBytes,
    filename: document.filename,
    caption: document.caption,
  });

  return {
    ...document,
    delivery,
  };
}
