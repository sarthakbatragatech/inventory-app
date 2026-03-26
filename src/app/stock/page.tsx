'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface StockItem {
  id: string;
  sku: string;
  item_name: string;
  category: string | null;
  family: string | null;
  families: string[];
  default_unit: string | null;
  created_at: string;
  inwardQty: number;
  consumedQty: number;
  reorderThresholdQty: number;
  balanceQty: number;
  lastInward: string | null;
  lastInwardQty: number | null;
  lastInwardUnit: string | null;
}

type StockResponse = {
  items: StockItem[];
  familyOptions: string[];
  categoryOptions: string[];
};

type ModelFilterOption = {
  id: string;
  fg_sku: string;
  fg_name: string | null;
  families: string[];
};

type ModelSnapshotComponent = {
  componentItemId: string;
  componentSku: string;
  componentName: string;
  unit: string | null;
  inwardQty: number;
  selectedModelConsumedQty: number;
  consumedQty: number;
  reorderThresholdQty: number;
  balanceQty: number;
};

type ModelSnapshot = {
  fgSku: string;
  fgName: string | null;
  isAggregate: boolean;
  salesQty: number;
  salesDateFrom: string | null;
  salesDateTo: string | null;
  components: ModelSnapshotComponent[];
};

type ModelAnalysisResponse = {
  models: ModelFilterOption[];
  familyOptions: string[];
  requestedFamily: string;
  requestedFgSku: string;
  snapshot: ModelSnapshot | null;
  error?: string;
};

type SyncSalesResponse = {
  mode?: 'window' | 'all';
  startDate?: string | null;
  endDate?: string | null;
  fetched?: number;
  upserted?: number;
  error?: string;
};

type SortKey =
  | 'sku'
  | 'item_name'
  | 'family'
  | 'category'
  | 'inwardQty'
  | 'consumedQty'
  | 'reorderThresholdQty'
  | 'balanceQty'
  | 'lastInward';

type SortDirection = 'asc' | 'desc';
type ViewMode = 'inventory' | 'model';

const categoryStyles: Record<string, string> = {
  plastic_part: 'bg-amber-100 text-amber-900 border-amber-200',
  electronic: 'bg-sky-100 text-sky-900 border-sky-200',
  metal_part: 'bg-slate-200 text-slate-900 border-slate-300',
  packaging: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  raw_material: 'bg-rose-100 text-rose-900 border-rose-200',
};

function formatCategory(category: string | null) {
  if (!category) {
    return 'Unknown';
  }

  return category
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatQuantity(quantity: number, unit: string | null) {
  const rounded = quantity.toFixed(2).replace(/\.?0+$/, '');
  return unit ? `${rounded} ${unit}` : rounded;
}

function formatInwardDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }

  return formatInwardDate(value);
}

function compareText(a: string | null, b: string | null) {
  return (a || '').localeCompare(b || '');
}

function renderFamilySummary(family: string | null, families: string[]): ReactNode {
  if (families.length === 1) {
    return families[0];
  }

  if (families.length > 1) {
    return (
      <span className="inline-flex items-baseline gap-1">
        <span>{families[0]}</span>
        <span
          className="font-bold text-sky-700"
          title={families.slice(1).join(', ')}
          aria-label={`${families.length - 1} shared ${families.length - 1 === 1 ? 'family' : 'families'}`}
        >
          +{families.length - 1}*
        </span>
      </span>
    );
  }

  return family || '—';
}

async function requestStock(q = '', selectedFamily = '', selectedCategory = '') {
  const params = new URLSearchParams();
  if (q.trim()) {
    params.set('q', q.trim());
  }
  if (selectedFamily) {
    params.set('family', selectedFamily);
  }
  if (selectedCategory) {
    params.set('category', selectedCategory);
  }

  const url = params.size ? `/api/stock?${params.toString()}` : '/api/stock';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch stock: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as StockResponse;
}

async function requestModelAnalysis(selectedFamily = '', selectedFgSku = '') {
  const params = new URLSearchParams();
  if (selectedFamily) {
    params.set('family', selectedFamily);
  }
  if (selectedFgSku) {
    params.set('fgSku', selectedFgSku);
  }

  const url = params.size
    ? `/api/stock/model-analysis?${params.toString()}`
    : '/api/stock/model-analysis';
  const res = await fetch(url);
  const data = (await res.json()) as ModelAnalysisResponse;

  if (!res.ok) {
    throw new Error(data.error || `Failed to fetch model analysis: ${res.status} ${res.statusText}`);
  }

  return data;
}

async function requestSalesSync() {
  const res = await fetch('/api/sync-sales', {
    method: 'POST',
  });
  const data = (await res.json()) as SyncSalesResponse;

  if (!res.ok) {
    throw new Error(data.error || `Failed to sync sales: ${res.status} ${res.statusText}`);
  }

  return data;
}

export default function StockPage() {
  const stockRequestIdRef = useRef(0);
  const modelRequestIdRef = useRef(0);
  const [viewMode, setViewMode] = useState<ViewMode>('inventory');

  const [items, setItems] = useState<StockItem[]>([]);
  const [familyOptions, setFamilyOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState('');
  const [category, setCategory] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('balanceQty');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [isLoading, setIsLoading] = useState(false);

  const [models, setModels] = useState<ModelFilterOption[]>([]);
  const [modelFamilyOptions, setModelFamilyOptions] = useState<string[]>([]);
  const [modelFamily, setModelFamily] = useState('');
  const [modelFgSku, setModelFgSku] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [modelSnapshot, setModelSnapshot] = useState<ModelSnapshot | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const deferredModelSearch = useDeferredValue(modelSearch);

  function applyStockResponse(data: StockResponse) {
    setItems(Array.isArray(data.items) ? data.items : []);
    setFamilyOptions(Array.isArray(data.familyOptions) ? data.familyOptions : []);
    setCategoryOptions(Array.isArray(data.categoryOptions) ? data.categoryOptions : []);
  }

  function applyModelAnalysisResponse(data: ModelAnalysisResponse) {
    setModels(Array.isArray(data.models) ? data.models : []);
    setModelFamilyOptions(Array.isArray(data.familyOptions) ? data.familyOptions : []);
    setModelFgSku(data.requestedFgSku || '');
    setModelSnapshot(data.snapshot ?? null);
  }

  const fetchStock = useCallback(async (q = '', selectedFamily = '', selectedCategory = '') => {
    const requestId = stockRequestIdRef.current + 1;
    stockRequestIdRef.current = requestId;
    setIsLoading(true);
    try {
      const data = await requestStock(q, selectedFamily, selectedCategory);
      if (requestId !== stockRequestIdRef.current) {
        return;
      }
      applyStockResponse(data);
      setErrorMessage('');
    } catch (error) {
      if (requestId !== stockRequestIdRef.current) {
        return;
      }
      console.error('Error fetching stock:', error);
      setItems([]);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load stock.');
    } finally {
      if (requestId === stockRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const fetchModelAnalysis = useCallback(async (selectedFamily = '', selectedFgSku = '') => {
    const requestId = modelRequestIdRef.current + 1;
    modelRequestIdRef.current = requestId;
    setIsModelLoading(true);
    try {
      const data = await requestModelAnalysis(selectedFamily, selectedFgSku);
      if (requestId !== modelRequestIdRef.current) {
        return;
      }
      applyModelAnalysisResponse(data);
      setErrorMessage('');
    } catch (error) {
      if (requestId !== modelRequestIdRef.current) {
        return;
      }
      console.error('Error fetching model analysis:', error);
      setModelSnapshot(null);
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to load model analysis.'
      );
    } finally {
      if (requestId === modelRequestIdRef.current) {
        setIsModelLoading(false);
      }
    }
  }, []);

  async function syncSalesAndRefresh() {
    setIsSyncing(true);
    setSyncMessage('');
    setErrorMessage('');

    try {
      const result = await requestSalesSync();
      await fetchStock(search, family, category);

      if (viewMode === 'model') {
        await fetchModelAnalysis(modelFamily, modelFgSku);
      }

      const windowLabel =
        result.startDate && result.endDate
          ? `${result.startDate} to ${result.endDate}`
          : 'all available dates';
      setSyncMessage(
        `Sales synced for ${windowLabel}. Imported ${result.upserted ?? 0} rows.`
      );
    } catch (error) {
      console.error('Error syncing sales:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to sync sales.');
    } finally {
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchStock(search, family, category);
    }, search.trim() ? 180 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [category, family, fetchStock, search]);

  useEffect(() => {
    if (viewMode !== 'model') {
      return;
    }

    void fetchModelAnalysis(modelFamily, modelFgSku);
  }, [fetchModelAnalysis, modelFamily, modelFgSku, viewMode]);

  const filteredModelOptions = useMemo(
    () =>
      modelFamily
        ? models.filter((model) => model.families.includes(modelFamily))
        : models,
    [modelFamily, models]
  );

  const filteredComponents = useMemo(() => {
    if (!modelSnapshot) {
      return [];
    }

    const q = deferredModelSearch.trim().toLowerCase();
    if (!q) {
      return modelSnapshot.components;
    }

    return modelSnapshot.components.filter((component) =>
      `${component.componentSku} ${component.componentName}`.toLowerCase().includes(q)
    );
  }, [deferredModelSearch, modelSnapshot]);

  const allModelsLabel = modelFamily ? `All ${modelFamily} Models` : 'All Models';
  const inventoryPrintPreviewHref = (() => {
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set('q', search.trim());
    }
    if (family) {
      params.set('family', family);
    }
    if (category) {
      params.set('category', category);
    }

    return params.size ? `/stock/print?${params.toString()}` : '/stock/print';
  })();
  const printPreviewHref = modelFgSku
    ? `/bom/print?fgSku=${encodeURIComponent(modelFgSku)}`
    : modelFamily
      ? `/bom/print?family=${encodeURIComponent(modelFamily)}`
      : '#';
  const selectedScopeLabel = modelSnapshot?.isAggregate ? 'Selected Scope' : 'Selected Model';

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(
      nextKey === 'lastInward' ||
        nextKey === 'inwardQty' ||
        nextKey === 'consumedQty' ||
        nextKey === 'reorderThresholdQty' ||
        nextKey === 'balanceQty'
        ? 'desc'
        : 'asc'
    );
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) {
      return '↕';
    }

    return sortDirection === 'asc' ? '↑' : '↓';
  }

  const sortedItems = [...items].sort((left, right) => {
    let result = 0;

    switch (sortKey) {
      case 'sku':
        result = compareText(left.sku, right.sku);
        break;
      case 'item_name':
        result = compareText(left.item_name, right.item_name);
        break;
      case 'family':
        result = compareText(left.family, right.family);
        break;
      case 'category':
        result = compareText(left.category, right.category);
        break;
      case 'inwardQty':
        result = left.inwardQty - right.inwardQty;
        break;
      case 'consumedQty':
        result = left.consumedQty - right.consumedQty;
        break;
      case 'reorderThresholdQty':
        result = left.reorderThresholdQty - right.reorderThresholdQty;
        break;
      case 'balanceQty':
        result = left.balanceQty - right.balanceQty;
        break;
      case 'lastInward':
        result =
          new Date(left.lastInward || 0).getTime() -
          new Date(right.lastInward || 0).getTime();
        break;
    }

    return sortDirection === 'asc' ? result : -result;
  });

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-5 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-4xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
          Stock
        </h1>
        <p
          className="mb-5 max-w-4xl text-base leading-8 text-neutral-700 sm:mb-6 sm:text-sm sm:leading-6"
          suppressHydrationWarning
        >
          Review inventory-wide inward, BOM-driven consumption, reorder threshold,
          current balance, and model-scoped BOM pressure from one page.
        </p>

        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex rounded-2xl border border-neutral-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('inventory')}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                viewMode === 'inventory'
                  ? 'bg-neutral-950 text-white'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              Inventory View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('model')}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                viewMode === 'model'
                  ? 'bg-neutral-950 text-white'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              Model View
            </button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="text-sm text-neutral-600">
              Stock updates after sales are synced from the order portal.
            </div>
            <button
              type="button"
              onClick={() => void syncSalesAndRefresh()}
              disabled={isSyncing || isLoading || isModelLoading}
              className="rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {isSyncing ? 'Syncing sales...' : 'Sync Sales'}
            </button>
          </div>
        </div>

        {syncMessage ? (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {syncMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        {viewMode === 'inventory' ? (
          <>
            <div
              className="mb-5 grid gap-3 md:mb-4 md:grid-cols-[minmax(0,1fr)_220px_220px_160px]"
              suppressHydrationWarning
            >
              <input
                type="text"
                placeholder="Search SKU / Name"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-base text-neutral-950 shadow-sm placeholder:text-neutral-400 sm:rounded-xl sm:p-3 sm:text-sm"
              />

              <select
                value={family}
                onChange={(event) => setFamily(event.target.value)}
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-base text-neutral-950 shadow-sm sm:rounded-xl sm:p-3 sm:text-sm"
                suppressHydrationWarning
              >
                <option value="">All Families</option>
                {familyOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-base text-neutral-950 shadow-sm sm:rounded-xl sm:p-3 sm:text-sm"
                suppressHydrationWarning
              >
                <option value="">All Categories</option>
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatCategory(option)}
                  </option>
                ))}
              </select>

              <a
                href={inventoryPrintPreviewHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-base font-medium text-neutral-800 shadow-sm transition hover:border-neutral-400 hover:bg-neutral-50 sm:rounded-xl sm:p-3 sm:text-sm"
              >
                Print Preview
              </a>
            </div>

            <div className="space-y-4 md:hidden">
              {sortedItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">
                        {renderFamilySummary(item.family, item.families) || 'Unassigned Family'}
                      </div>
                      <div className="mt-2 break-words text-lg font-semibold leading-7 text-neutral-950">
                        {item.item_name}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
                        item.category
                          ? categoryStyles[item.category] ||
                            'border-neutral-200 bg-neutral-100 text-neutral-700'
                          : 'border-neutral-200 bg-neutral-100 text-neutral-700'
                      }`}
                    >
                      {formatCategory(item.category)}
                    </span>
                  </div>

                  <div className="mb-4 break-words text-sm font-semibold text-sky-700">
                    {item.sku}
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-2xl bg-neutral-50 p-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        Inward
                      </div>
                      <div className="mt-1 text-sm font-semibold text-neutral-950">
                        {formatQuantity(item.inwardQty, item.default_unit)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        Consumed
                      </div>
                      <div className="mt-1 text-sm font-semibold text-neutral-950">
                        {formatQuantity(item.consumedQty, item.default_unit)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        Threshold
                      </div>
                      <div className="mt-1 text-sm font-semibold text-neutral-950">
                        {formatQuantity(item.reorderThresholdQty, item.default_unit)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        Balance
                      </div>
                      <div
                        className={`mt-1 text-sm font-semibold ${
                          item.balanceQty < item.reorderThresholdQty
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatQuantity(item.balanceQty, item.default_unit)}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        Last Inward
                      </div>
                      <div className="mt-1 text-sm font-semibold text-neutral-950">
                        {item.lastInward ? formatInwardDate(item.lastInward) : '—'}
                      </div>
                      <div className="text-xs text-neutral-600">
                        {item.lastInwardQty !== null
                          ? formatQuantity(
                              item.lastInwardQty,
                              item.lastInwardUnit || item.default_unit
                            )
                          : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm md:block">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-100 text-left">
                  <tr>
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort('sku')} className="font-semibold">
                        SKU {sortIndicator('sku')}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort('item_name')} className="font-semibold">
                        Name {sortIndicator('item_name')}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort('family')} className="font-semibold">
                        Family {sortIndicator('family')}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort('category')} className="font-semibold">
                        Category {sortIndicator('category')}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort('inwardQty')} className="font-semibold">
                        Inward {sortIndicator('inwardQty')}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort('consumedQty')} className="font-semibold">
                        Consumed {sortIndicator('consumedQty')}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort('reorderThresholdQty')} className="font-semibold">
                        Threshold {sortIndicator('reorderThresholdQty')}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort('balanceQty')} className="font-semibold">
                        Balance {sortIndicator('balanceQty')}
                      </button>
                    </th>
                    <th className="px-4 py-3">
                      <button type="button" onClick={() => toggleSort('lastInward')} className="font-semibold">
                        Last Inward {sortIndicator('lastInward')}
                      </button>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {sortedItems.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t border-neutral-200 transition hover:bg-sky-50/70"
                    >
                      <td className="px-4 py-3 font-medium text-neutral-700">{item.sku}</td>
                      <td className="px-4 py-3">{item.item_name}</td>
                      <td className="px-4 py-3">{renderFamilySummary(item.family, item.families)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                            item.category
                              ? categoryStyles[item.category] ||
                                'border-neutral-200 bg-neutral-100 text-neutral-700'
                              : 'border-neutral-200 bg-neutral-100 text-neutral-700'
                          }`}
                        >
                          {formatCategory(item.category)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatQuantity(item.inwardQty, item.default_unit)}
                      </td>
                      <td className="px-4 py-3">
                        {formatQuantity(item.consumedQty, item.default_unit)}
                      </td>
                      <td className="px-4 py-3">
                        {formatQuantity(item.reorderThresholdQty, item.default_unit)}
                      </td>
                      <td
                        className={`px-4 py-3 font-semibold ${
                          item.balanceQty < item.reorderThresholdQty
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatQuantity(item.balanceQty, item.default_unit)}
                      </td>
                      <td className="px-4 py-3">
                        {item.lastInward ? (
                          <div>
                            <div>{formatInwardDate(item.lastInward)}</div>
                            <div className="text-xs text-neutral-500">
                              {item.lastInwardQty !== null
                                ? formatQuantity(
                                    item.lastInwardQty,
                                    item.lastInwardUnit || item.default_unit
                                  )
                                : '—'}
                            </div>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!isLoading && items.length === 0 ? (
              <div className="mt-4 rounded-3xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center text-sm text-neutral-500">
                No stock rows match the current filters.
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="mb-5 grid gap-3 md:mb-4 md:grid-cols-[minmax(0,1fr)_220px_320px_160px]">
              <input
                type="text"
                value={modelSearch}
                onChange={(event) => setModelSearch(event.target.value)}
                placeholder="Search component SKU / Name"
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-base text-neutral-950 shadow-sm placeholder:text-neutral-400 sm:rounded-xl sm:p-3 sm:text-sm"
              />

              <select
                value={modelFamily}
                onChange={(event) => {
                  const nextFamily = event.target.value;
                  const nextModels = nextFamily
                    ? models.filter((model) => model.families.includes(nextFamily))
                    : models;

                  setModelFamily(nextFamily);
                  setModelFgSku((current) =>
                    nextModels.some((model) => model.fg_sku === current) ? current : ''
                  );
                }}
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-base text-neutral-950 shadow-sm sm:rounded-xl sm:p-3 sm:text-sm"
              >
                <option value="">All Families</option>
                {modelFamilyOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <select
                value={modelFgSku}
                onChange={(event) => setModelFgSku(event.target.value)}
                className="rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-base text-neutral-950 shadow-sm sm:rounded-xl sm:p-3 sm:text-sm"
              >
                <option value="">{allModelsLabel}</option>
                {filteredModelOptions.map((model) => (
                  <option key={model.id} value={model.fg_sku}>
                    {model.fg_name ? `${model.fg_sku} - ${model.fg_name}` : model.fg_sku}
                  </option>
                ))}
              </select>

              <a
                href={printPreviewHref}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center justify-center rounded-2xl border px-4 py-4 text-base font-medium transition sm:rounded-xl sm:p-3 sm:text-sm ${
                  modelFgSku || modelFamily
                    ? 'border-neutral-300 bg-white text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50'
                    : 'pointer-events-none border-neutral-200 bg-neutral-100 text-neutral-400'
                }`}
              >
                Print Preview
              </a>
            </div>

            {modelSnapshot ? (
              <div className="mb-4 rounded-3xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_0.8fr_0.8fr_0.8fr]">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                      Model Scope
                    </div>
                    <div className="mt-1 truncate text-lg font-semibold text-neutral-950">
                      {modelSnapshot.fgName || modelSnapshot.fgSku}
                    </div>
                    <div className="text-xs text-neutral-500">{modelSnapshot.fgSku}</div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                      Sales Qty
                    </div>
                    <div className="mt-1 text-base font-semibold text-neutral-950">
                      {formatQuantity(modelSnapshot.salesQty, 'pcs')}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                      Sales From
                    </div>
                    <div className="mt-1 text-base font-semibold text-neutral-950">
                      {formatDate(modelSnapshot.salesDateFrom)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                      Sales To
                    </div>
                    <div className="mt-1 text-base font-semibold text-neutral-950">
                      {formatDate(modelSnapshot.salesDateTo)}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="space-y-4 md:hidden">
              {filteredComponents.map((component) => (
                <div
                  key={component.componentItemId}
                  className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">
                        {component.componentSku}
                      </div>
                      <div className="mt-2 break-words text-lg font-semibold leading-7 text-neutral-950">
                        {component.componentName}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
                        component.balanceQty < component.reorderThresholdQty
                          ? 'border-rose-200 bg-rose-100 text-rose-800'
                          : 'border-emerald-200 bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {component.balanceQty < component.reorderThresholdQty ? 'Reorder' : 'Healthy'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 rounded-2xl bg-neutral-50 p-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        Inward
                      </div>
                      <div className="mt-1 text-sm font-semibold text-neutral-950">
                        {formatQuantity(component.inwardQty, component.unit)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        {selectedScopeLabel}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-neutral-950">
                        {formatQuantity(component.selectedModelConsumedQty, component.unit)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        All Models
                      </div>
                      <div className="mt-1 text-sm font-semibold text-neutral-950">
                        {formatQuantity(component.consumedQty, component.unit)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        Threshold
                      </div>
                      <div className="mt-1 text-sm font-semibold text-neutral-950">
                        {formatQuantity(component.reorderThresholdQty, component.unit)}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        Balance
                      </div>
                      <div
                        className={`mt-1 text-sm font-semibold ${
                          component.balanceQty < component.reorderThresholdQty
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatQuantity(component.balanceQty, component.unit)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm md:block">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-100 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Component SKU</th>
                    <th className="px-4 py-3 font-semibold">Component</th>
                    <th className="px-4 py-3 font-semibold">Inward</th>
                    <th className="px-4 py-3 font-semibold">{selectedScopeLabel}</th>
                    <th className="px-4 py-3 font-semibold">All Models</th>
                    <th className="px-4 py-3 font-semibold">Threshold</th>
                    <th className="px-4 py-3 font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredComponents.map((component) => (
                    <tr
                      key={component.componentItemId}
                      className="border-t border-neutral-200 transition hover:bg-sky-50/70"
                    >
                      <td className="px-4 py-3 font-medium text-neutral-700">
                        {component.componentSku}
                      </td>
                      <td className="px-4 py-3">{component.componentName}</td>
                      <td className="px-4 py-3 font-semibold">
                        {formatQuantity(component.inwardQty, component.unit)}
                      </td>
                      <td className="px-4 py-3">
                        {formatQuantity(component.selectedModelConsumedQty, component.unit)}
                      </td>
                      <td className="px-4 py-3">
                        {formatQuantity(component.consumedQty, component.unit)}
                      </td>
                      <td className="px-4 py-3">
                        {formatQuantity(component.reorderThresholdQty, component.unit)}
                      </td>
                      <td
                        className={`px-4 py-3 font-semibold ${
                          component.balanceQty < component.reorderThresholdQty
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatQuantity(component.balanceQty, component.unit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!isModelLoading && !modelSnapshot ? (
              <div className="mt-4 rounded-3xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center text-sm text-neutral-500">
                No BOM models match the current family filter.
              </div>
            ) : null}

            {!isModelLoading && modelSnapshot && filteredComponents.length === 0 ? (
              <div className="mt-4 rounded-3xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center text-sm text-neutral-500">
                No model-view rows match the current filters.
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
