'use client';

import { useEffect, useState } from 'react';
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

export default function StockPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [familyOptions, setFamilyOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState('');
  const [category, setCategory] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('balanceQty');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  function applyStockResponse(data: StockResponse) {
    setItems(Array.isArray(data.items) ? data.items : []);
    setFamilyOptions(Array.isArray(data.familyOptions) ? data.familyOptions : []);
    setCategoryOptions(
      Array.isArray(data.categoryOptions) ? data.categoryOptions : []
    );
  }

  async function fetchStock(q = '', selectedFamily = '', selectedCategory = '') {
    try {
      const data = await requestStock(q, selectedFamily, selectedCategory);
      applyStockResponse(data);
    } catch (error) {
      console.error('Error fetching stock:', error);
      setItems([]);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialStock() {
      try {
        const data = await requestStock();
        if (!cancelled) {
          applyStockResponse(data);
        }
      } catch (error) {
        console.error('Error fetching stock:', error);
        if (!cancelled) {
          setItems([]);
        }
      }
    }

    void loadInitialStock();

    return () => {
      cancelled = true;
    };
  }, []);

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
          className="mb-5 max-w-3xl text-base leading-8 text-neutral-700 sm:mb-6 sm:text-sm sm:leading-6"
          suppressHydrationWarning
        >
          Review inventory-wide inward, BOM-driven consumption, reorder threshold,
          and current balance. Production is not included yet.
        </p>

        <div
          className="mb-5 grid gap-3 md:mb-4 md:grid-cols-[minmax(0,1fr)_220px_220px]"
          suppressHydrationWarning
        >
          <input
            type="text"
            placeholder="Search SKU / Name"
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              void fetchStock(value, family, category);
            }}
            className="rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-base text-neutral-950 shadow-sm placeholder:text-neutral-400 sm:rounded-xl sm:p-3 sm:text-sm"
          />

          <select
            value={family}
            onChange={(e) => {
              const value = e.target.value;
              setFamily(value);
              void fetchStock(search, value, category);
            }}
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
            onChange={(e) => {
              const value = e.target.value;
              setCategory(value);
              void fetchStock(search, family, value);
            }}
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
      </div>
    </div>
  );
}
