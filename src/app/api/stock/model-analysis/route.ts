import { NextRequest, NextResponse } from 'next/server';
import { deriveModelFamilies } from '@/lib/model-analysis';
import {
  getStockSnapshotByFgSku,
  getStockSnapshotByFgSkus,
  listStockModels,
} from '@/lib/stock';

function formatLoadError(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'Failed to load model analysis data.';

  if (message.toLowerCase().includes('fetch failed')) {
    return 'Unable to reach the inventory database right now. Refresh the page after the connection is back.';
  }

  return message;
}

export async function GET(request: NextRequest) {
  const requestedFamily = request.nextUrl.searchParams.get('family')?.trim() || '';
  const requestedFgSku = request.nextUrl.searchParams.get('fgSku')?.trim() || '';

  try {
    const models = await listStockModels();
    const modelsWithFamily = models.map((model) => ({
      ...model,
      families: deriveModelFamilies(model.fg_sku, model.fg_name),
    }));

    const familyOptions = [
      ...new Set(modelsWithFamily.flatMap((model) => model.families).filter(Boolean)),
    ].sort((left, right) => left.localeCompare(right));

    const filteredModels = requestedFamily
      ? modelsWithFamily.filter((model) => model.families.includes(requestedFamily))
      : modelsWithFamily;

    const selectedFgSku =
      requestedFgSku && filteredModels.some((model) => model.fg_sku === requestedFgSku)
        ? requestedFgSku
        : '';

    const snapshot = selectedFgSku
      ? await getStockSnapshotByFgSku(selectedFgSku)
      : await getStockSnapshotByFgSkus(
          filteredModels.map((model) => model.fg_sku),
          {
            fgSkuLabel: requestedFamily || 'ALL MODELS',
            fgNameLabel: requestedFamily ? `All ${requestedFamily} Models` : 'All Models',
          }
        );

    return NextResponse.json({
      models: modelsWithFamily,
      familyOptions,
      requestedFamily,
      requestedFgSku: selectedFgSku,
      snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      { error: formatLoadError(error) },
      { status: 500 }
    );
  }
}
