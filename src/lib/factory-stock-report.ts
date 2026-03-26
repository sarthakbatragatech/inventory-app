import { getStockListItems, type StockListItem } from '@/lib/stock';

export type FactoryStockReportRow = {
  id: string;
  sku: string;
  itemName: string;
  family: string;
  category: string;
  unit: string | null;
  inwardQty: number;
  consumedQty: number;
  reorderThresholdQty: number;
  balanceQty: number;
  lastInward: string | null;
  lastInwardQty: number | null;
  lastInwardUnit: string | null;
};

export type FactoryStockCategorySummary = {
  key: string;
  label: string;
  itemCount: number;
  negativeCount: number;
  reorderCount: number;
};

export type FactoryStockCategorySection = {
  key: string;
  label: string;
  items: FactoryStockReportRow[];
};

export type FactoryStockReport = {
  generatedAt: string;
  totalItemCount: number;
  negativeItemCount: number;
  reorderItemCount: number;
  categorySummaries: FactoryStockCategorySummary[];
  negativeItems: FactoryStockReportRow[];
  reorderItems: FactoryStockReportRow[];
  categorySections: FactoryStockCategorySection[];
};

const CATEGORY_ORDER = [
  'electronic',
  'metal_part',
  'plastic_part',
  'packaging',
  'raw_material',
  'unknown',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  electronic: 'Electronic',
  metal_part: 'Metal Part',
  plastic_part: 'Plastic Part',
  packaging: 'Packaging',
  raw_material: 'Raw Material',
  unknown: 'Unknown',
};

function sortRows(left: FactoryStockReportRow, right: FactoryStockReportRow) {
  const leftIssueScore = Number(left.balanceQty < left.reorderThresholdQty);
  const rightIssueScore = Number(right.balanceQty < right.reorderThresholdQty);
  if (leftIssueScore !== rightIssueScore) {
    return rightIssueScore - leftIssueScore;
  }

  if (left.balanceQty !== right.balanceQty) {
    return left.balanceQty - right.balanceQty;
  }

  return left.itemName.localeCompare(right.itemName) || left.sku.localeCompare(right.sku);
}

function toCategoryKey(category: string | null) {
  return category || 'unknown';
}

function toCategoryLabel(category: string | null) {
  return CATEGORY_LABELS[toCategoryKey(category)] || 'Unknown';
}

function toReportRow(item: StockListItem): FactoryStockReportRow {
  return {
    id: item.id,
    sku: item.sku,
    itemName: item.item_name,
    family: item.families[0] || item.family || '—',
    category: toCategoryLabel(item.category),
    unit: item.default_unit,
    inwardQty: item.inwardQty,
    consumedQty: item.consumedQty,
    reorderThresholdQty: item.reorderThresholdQty,
    balanceQty: item.balanceQty,
    lastInward: item.lastInward,
    lastInwardQty: item.lastInwardQty,
    lastInwardUnit: item.lastInwardUnit,
  };
}

export async function buildFactoryStockReport(): Promise<FactoryStockReport> {
  const items = await getStockListItems();
  const categorizedRows = items.map((item) => ({
    categoryKey: toCategoryKey(item.category),
    row: toReportRow(item),
  }));
  const rows = categorizedRows.map((entry) => entry.row);
  const negativeItems = rows.filter((item) => item.balanceQty < 0).sort(sortRows);
  const reorderItems = rows
    .filter((item) => item.balanceQty < item.reorderThresholdQty)
    .sort(sortRows);

  const categorySummaries = CATEGORY_ORDER.map((categoryKey) => {
    const categoryRows = categorizedRows
      .filter((entry) => entry.categoryKey === categoryKey)
      .map((entry) => entry.row);
    return {
      key: categoryKey,
      label: CATEGORY_LABELS[categoryKey],
      itemCount: categoryRows.length,
      negativeCount: categoryRows.filter((item) => item.balanceQty < 0).length,
      reorderCount: categoryRows.filter((item) => item.balanceQty < item.reorderThresholdQty).length,
    };
  }).filter((summary) => summary.itemCount > 0);

  const categorySections = categorySummaries.map((summary) => {
    const sectionItems = categorizedRows
      .filter((entry) => entry.categoryKey === summary.key)
      .map((entry) => entry.row)
      .sort(sortRows);

    return {
      key: summary.key,
      label: summary.label,
      items: sectionItems,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    totalItemCount: rows.length,
    negativeItemCount: negativeItems.length,
    reorderItemCount: reorderItems.length,
    categorySummaries,
    negativeItems,
    reorderItems,
    categorySections,
  };
}
