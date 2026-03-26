import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { FactoryStockReport, FactoryStockReportRow } from '@/lib/factory-stock-report';

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN_X = 32;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 26;
const HEADER_HEIGHT = 26;
const ROW_HEIGHT = 16;
const FONT_SIZE = 8;
const SMALL_FONT_SIZE = 7;

type TableColumn<T> = {
  key: string;
  label: string;
  width: number;
  align?: 'left' | 'right';
  value: (row: T) => string;
};

function formatQuantity(quantity: number, unit: string | null) {
  const rounded = quantity.toFixed(2).replace(/\.?0+$/, '');
  return unit ? `${rounded} ${unit}` : rounded;
}

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export async function buildFactoryStockPdf(report: FactoryStockReport) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  let pageNumber = 0;

  const stockColumns: TableColumn<FactoryStockReportRow>[] = [
    { key: 'sku', label: 'SKU', width: 108, value: (row) => truncate(row.sku, 24) },
    { key: 'item', label: 'Item', width: 170, value: (row) => truncate(row.itemName, 34) },
    { key: 'family', label: 'Family', width: 58, value: (row) => truncate(row.family, 10) },
    { key: 'inward', label: 'Inward', width: 72, align: 'right', value: (row) => formatQuantity(row.inwardQty, row.unit) },
    { key: 'used', label: 'Consumed', width: 72, align: 'right', value: (row) => formatQuantity(row.consumedQty, row.unit) },
    { key: 'threshold', label: 'Threshold', width: 72, align: 'right', value: (row) => formatQuantity(row.reorderThresholdQty, row.unit) },
    { key: 'balance', label: 'Balance', width: 72, align: 'right', value: (row) => formatQuantity(row.balanceQty, row.unit) },
    { key: 'last', label: 'Last Inward', width: 86, value: (row) => row.lastInward ? `${formatDate(row.lastInward)} ${row.lastInwardQty !== null ? `(${formatQuantity(row.lastInwardQty, row.lastInwardUnit || row.unit)})` : ''}`.trim() : '—' },
  ];

  const addPage = (title: string, subtitle?: string) => {
    pageNumber += 1;
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawText(title, {
      x: MARGIN_X,
      y: PAGE_HEIGHT - MARGIN_TOP,
      font: boldFont,
      size: 20,
      color: rgb(0.1, 0.12, 0.15),
    });
    if (subtitle) {
      page.drawText(subtitle, {
        x: MARGIN_X,
        y: PAGE_HEIGHT - MARGIN_TOP - 18,
        font,
        size: 10,
        color: rgb(0.38, 0.4, 0.45),
      });
    }
    page.drawText(`Page ${pageNumber}`, {
      x: PAGE_WIDTH - MARGIN_X - 34,
      y: PAGE_HEIGHT - MARGIN_TOP + 2,
      font,
      size: 8,
      color: rgb(0.45, 0.47, 0.52),
    });
    return page;
  };

  const drawSummaryCard = (
    page: ReturnType<typeof pdf.addPage>,
    x: number,
    y: number,
    label: string,
    value: string
  ) => {
    page.drawRectangle({
      x,
      y: y - 46,
      width: 180,
      height: 46,
      color: rgb(0.97, 0.97, 0.98),
      borderColor: rgb(0.86, 0.87, 0.9),
      borderWidth: 1,
    });
    page.drawText(label, {
      x: x + 12,
      y: y - 16,
      font,
      size: 9,
      color: rgb(0.36, 0.38, 0.43),
    });
    page.drawText(value, {
      x: x + 12,
      y: y - 34,
      font: boldFont,
      size: 18,
      color: rgb(0.1, 0.12, 0.15),
    });
  };

  const drawTable = <T,>(
    initialPage: ReturnType<typeof pdf.addPage>,
    title: string,
    subtitle: string,
    rows: T[],
    columns: TableColumn<T>[]
  ) => {
    let page = initialPage;
    let y = PAGE_HEIGHT - 132;

    const drawTableHeader = (headerTitle: string, headerSubtitle: string) => {
      page.drawText(headerTitle, {
        x: MARGIN_X,
        y: PAGE_HEIGHT - 96,
        font: boldFont,
        size: 13,
        color: rgb(0.12, 0.14, 0.18),
      });
      page.drawText(headerSubtitle, {
        x: MARGIN_X,
        y: PAGE_HEIGHT - 111,
        font,
        size: 9,
        color: rgb(0.45, 0.47, 0.52),
      });
      page.drawRectangle({
        x: MARGIN_X,
        y: y,
        width: PAGE_WIDTH - MARGIN_X * 2,
        height: HEADER_HEIGHT,
        color: rgb(0.94, 0.95, 0.97),
      });
      let columnX = MARGIN_X + 6;
      for (const column of columns) {
        page.drawText(column.label, {
          x: columnX,
          y: y + 8,
          font: boldFont,
          size: SMALL_FONT_SIZE,
          color: rgb(0.22, 0.24, 0.28),
        });
        columnX += column.width;
      }
      y -= HEADER_HEIGHT;
    };

    drawTableHeader(title, subtitle);

    for (const row of rows) {
      if (y <= MARGIN_BOTTOM + ROW_HEIGHT) {
        page = addPage(title, subtitle);
        y = PAGE_HEIGHT - 132;
        drawTableHeader(title, subtitle);
      }

      page.drawRectangle({
        x: MARGIN_X,
        y,
        width: PAGE_WIDTH - MARGIN_X * 2,
        height: ROW_HEIGHT,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.92, 0.93, 0.95),
        borderWidth: 0.5,
      });

      let columnX = MARGIN_X + 6;
      for (const column of columns) {
        const text = truncate(column.value(row), column.align === 'right' ? 18 : 38);
        const textWidth = font.widthOfTextAtSize(text, FONT_SIZE);
        const drawX =
          column.align === 'right'
            ? columnX + column.width - textWidth - 8
            : columnX;
        page.drawText(text, {
          x: drawX,
          y: y + 5,
          font,
          size: FONT_SIZE,
          color: rgb(0.16, 0.17, 0.2),
        });
        columnX += column.width;
      }

      y -= ROW_HEIGHT;
    }

    if (!rows.length) {
      page.drawText('No rows in this section.', {
        x: MARGIN_X,
        y: y - 2,
        font,
        size: 10,
        color: rgb(0.45, 0.47, 0.52),
      });
    }
  };

  const coverPage = addPage(
    'Factory Stock Report',
    `Generated ${new Date(report.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`
  );

  drawSummaryCard(coverPage, MARGIN_X, PAGE_HEIGHT - 92, 'Total SKUs', String(report.totalItemCount));
  drawSummaryCard(coverPage, MARGIN_X + 196, PAGE_HEIGHT - 92, 'Negative Balance', String(report.negativeItemCount));
  drawSummaryCard(coverPage, MARGIN_X + 392, PAGE_HEIGHT - 92, 'Below Threshold', String(report.reorderItemCount));

  coverPage.drawText('Category Summary', {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 172,
    font: boldFont,
    size: 13,
    color: rgb(0.12, 0.14, 0.18),
  });

  let summaryY = PAGE_HEIGHT - 198;
  for (const summary of report.categorySummaries) {
    coverPage.drawText(
      `${summary.label}: ${summary.itemCount} SKUs | ${summary.negativeCount} negative | ${summary.reorderCount} below threshold`,
      {
        x: MARGIN_X,
        y: summaryY,
        font,
        size: 10,
        color: rgb(0.18, 0.2, 0.23),
      }
    );
    summaryY -= 16;
  }

  drawTable(
    addPage('Factory Stock Report', 'Critical negative-balance items'),
    'Negative Stock',
    'Items whose current balance is below zero',
    report.negativeItems,
    stockColumns
  );

  drawTable(
    addPage('Factory Stock Report', 'Items below reorder threshold'),
    'Reorder Watchlist',
    'Items whose current balance is below their threshold',
    report.reorderItems,
    stockColumns
  );

  for (const section of report.categorySections) {
    drawTable(
      addPage('Factory Stock Report', `${section.label} stock snapshot`),
      section.label,
      `${section.items.length} SKUs in this category`,
      section.items,
      stockColumns
    );
  }

  return pdf.save();
}
