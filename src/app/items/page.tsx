'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Item {
  id: string;
  sku: string;
  item_name: string;
  category: string | null;
  family: string | null;
  default_unit: string | null;
  created_at: string;
  totalQty: number;
  lastInward: string | null;
  lastInwardQty: number | null;
  lastInwardUnit: string | null;
}

type ItemsResponse = {
  items: Item[];
  familyOptions: string[];
  categoryOptions: string[];
};

type SortKey =
  | 'sku'
  | 'item_name'
  | 'family'
  | 'category'
  | 'totalQty'
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

async function requestItems(
  q = '',
  selectedFamily = '',
  selectedCategory = ''
) {
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

  const url = params.size ? `/api/items?${params.toString()}` : '/api/items';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch items: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as ItemsResponse;
}

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [familyOptions, setFamilyOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState('');
  const [category, setCategory] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('item_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  function applyItemsResponse(data: ItemsResponse) {
    setItems(Array.isArray(data.items) ? data.items : []);
    setFamilyOptions(Array.isArray(data.familyOptions) ? data.familyOptions : []);
    setCategoryOptions(
      Array.isArray(data.categoryOptions) ? data.categoryOptions : []
    );
  }

  async function fetchItems(
    q = '',
    selectedFamily = '',
    selectedCategory = ''
  ) {
    try {
      const data = await requestItems(q, selectedFamily, selectedCategory);
      applyItemsResponse(data);
    } catch (error) {
      console.error('Error fetching items:', error);
      setItems([]);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialItems() {
      try {
        const data = await requestItems();
        if (!cancelled) {
          applyItemsResponse(data);
        }
      } catch (error) {
        console.error('Error fetching items:', error);
        if (!cancelled) {
          setItems([]);
        }
      }
    }

    void loadInitialItems();

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
    setSortDirection(nextKey === 'lastInward' || nextKey === 'totalQty' ? 'desc' : 'asc');
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
      case 'totalQty':
        result = left.totalQty - right.totalQty;
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
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-2 text-3xl font-semibold">SKU List</h1>
        <p
          className="mb-6 text-sm text-neutral-600"
          suppressHydrationWarning
        >
          Filter by name or SKU, then narrow the list by family and category.
        </p>

        <div
          className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_220px]"
          suppressHydrationWarning
        >
          <input
            type="text"
            placeholder="Search SKU / Name"
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              void fetchItems(value, family, category);
            }}
            className="rounded-xl border border-neutral-300 bg-white p-3"
          />

          <select
            value={family}
            onChange={(e) => {
              const value = e.target.value;
              setFamily(value);
              void fetchItems(search, value, category);
            }}
            className="rounded-xl border border-neutral-300 bg-white p-3"
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
              void fetchItems(search, family, value);
            }}
            className="rounded-xl border border-neutral-300 bg-white p-3"
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

        <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
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
                  <button type="button" onClick={() => toggleSort('totalQty')} className="font-semibold">
                    Total Qty {sortIndicator('totalQty')}
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
                <tr key={item.id} className="border-t border-neutral-200">
                  <td className="px-4 py-3 font-medium text-neutral-700">
                    <Link
                      href={`/items/${item.id}`}
                      className="text-neutral-900 underline decoration-neutral-300 underline-offset-4 transition hover:decoration-neutral-900"
                    >
                      {item.sku}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{item.item_name}</td>
                  <td className="px-4 py-3">{item.family || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${
                        item.category
                          ? categoryStyles[item.category] || 'bg-neutral-100 text-neutral-700 border-neutral-200'
                          : 'bg-neutral-100 text-neutral-700 border-neutral-200'
                      }`}
                    >
                      {formatCategory(item.category)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {formatQuantity(item.totalQty, item.default_unit)}
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
