import { NextResponse } from 'next/server';
import { listOrderPortalSales } from '@/lib/order-sales';
import { supabaseInventory } from '@/lib/supabaseInventory';

const DEFAULT_LOOKBACK_DAYS = 30;
const UPSERT_CHUNK_SIZE = 500;

type ImportedSaleRow = {
  sale_date: string;
  fg_sku: string;
  fg_name: string | null;
  category: string | null;
  qty: number;
  source_item_id: string | null;
};

type SyncWindow = {
  startDate: string;
  endDate: string;
};

type SyncMode = 'window' | 'all';

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

function formatDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getDefaultStartDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - DEFAULT_LOOKBACK_DAYS);
  return formatDateUtc(date);
}

function resolveSyncWindow(startDateOverride?: string | null): SyncWindow {
  const endDate = formatDateUtc(new Date());
  const startDate = startDateOverride?.trim() || getDefaultStartDate();

  if (!isIsoDate(startDate)) {
    throw new Error('Invalid startDate. Use YYYY-MM-DD.');
  }

  if (startDate > endDate) {
    throw new Error(`Invalid startDate. ${startDate} is after ${endDate}.`);
  }

  return {
    startDate,
    endDate,
  };
}

async function fetchSourceRows(window: SyncWindow | null) {
  const rows = await listOrderPortalSales(window ?? undefined);
  return rows.map((row) => ({
    sale_date: row.sale_date,
    fg_sku: row.model_key,
    fg_name: row.fg_name,
    category: row.category,
    qty: row.qty,
    source_item_id: row.source_item_id,
  }));
}

async function upsertImportedRows(rows: ImportedSaleRow[]) {
  if (rows.length === 0) {
    return 0;
  }

  let upsertedCount = 0;

  for (const chunk of chunkArray(rows, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabaseInventory
      .from('daily_fg_sales_import')
      .upsert(chunk, { onConflict: 'sale_date,fg_sku' });

    if (error) {
      throw new Error(`Target upsert failed: ${error.message}`);
    }

    upsertedCount += chunk.length;
  }

  return upsertedCount;
}

async function syncSales(window: SyncWindow | null) {
  const sourceRows = await fetchSourceRows(window);
  const upserted = await upsertImportedRows(sourceRows);

  return {
    startDate: window?.startDate ?? null,
    endDate: window?.endDate ?? null,
    fetched: sourceRows.length,
    upserted,
  };
}

async function getSyncOptions(request: Request) {
  const url = new URL(request.url);
  const searchParamStartDate = url.searchParams.get('startDate');
  const searchParamAll = url.searchParams.get('all');

  if (searchParamAll === 'true' || searchParamAll === '1') {
    return {
      mode: 'all' as SyncMode,
      startDate: null,
    };
  }

  if (searchParamStartDate) {
    return {
      mode: 'window' as SyncMode,
      startDate: searchParamStartDate,
    };
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return {
      mode: 'window' as SyncMode,
      startDate: null,
    };
  }

  const body = (await request.json()) as { startDate?: string; all?: boolean };

  if (body.all) {
    return {
      mode: 'all' as SyncMode,
      startDate: null,
    };
  }

  return {
    mode: 'window' as SyncMode,
    startDate: body.startDate ?? null,
  };
}

async function handleSync(request: Request) {
  try {
    const options = await getSyncOptions(request);
    const window = options.mode === 'all' ? null : resolveSyncWindow(options.startDate);
    const result = await syncSales(window);
    return NextResponse.json({
      mode: options.mode,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown sync-sales error';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handleSync(request);
}

export async function GET(request: Request) {
  return handleSync(request);
}
