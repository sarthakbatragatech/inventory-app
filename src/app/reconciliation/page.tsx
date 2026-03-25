'use client';

import { useEffect, useEffectEvent, useMemo, useState } from 'react';

type ReconciliationItem = {
  id: string;
  sku: string;
  item_name: string;
  family: string | null;
  families: string[];
  category: string | null;
  default_unit: string | null;
  balanceQty: number;
  physicalQty: number | null;
  notes: string | null;
  varianceQty: number | null;
};

type ReconciliationPageResponse = {
  items: ReconciliationItem[];
  familyOptions: string[];
  categoryOptions: string[];
  error?: string;
};

type EditableReconciliationItem = ReconciliationItem & {
  draftPhysicalQty: string;
  draftNotes: string;
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

function formatQuantity(quantity: number | null, unit: string | null) {
  if (quantity === null) {
    return '—';
  }

  const rounded = quantity.toFixed(2).replace(/\.?0+$/, '');
  return unit ? `${rounded} ${unit}` : rounded;
}

function getTodayIsoDate() {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

function normalizeDraftQuantity(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const quantity = Number(trimmed);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return NaN;
  }

  return quantity;
}

async function requestReconciliationItems(params: {
  date: string;
  q?: string;
  family?: string;
  category?: string;
}) {
  const searchParams = new URLSearchParams({ date: params.date });
  if (params.q?.trim()) {
    searchParams.set('q', params.q.trim());
  }
  if (params.family) {
    searchParams.set('family', params.family);
  }
  if (params.category) {
    searchParams.set('category', params.category);
  }

  const response = await fetch(`/api/reconciliation?${searchParams.toString()}`, {
    cache: 'no-store',
  });
  const result = (await response.json()) as ReconciliationPageResponse;

  if (!response.ok) {
    throw new Error(result.error || 'Failed to load reconciliation items.');
  }

  return result;
}

export default function ReconciliationPage() {
  const [selectedDate, setSelectedDate] = useState(getTodayIsoDate);
  const [search, setSearch] = useState('');
  const [family, setFamily] = useState('');
  const [category, setCategory] = useState('');
  const [items, setItems] = useState<EditableReconciliationItem[]>([]);
  const [familyOptions, setFamilyOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function loadItems(nextParams?: {
    date?: string;
    q?: string;
    family?: string;
    category?: string;
  }) {
    const params = {
      date: nextParams?.date ?? selectedDate,
      q: nextParams?.q ?? search,
      family: nextParams?.family ?? family,
      category: nextParams?.category ?? category,
    };

    setIsLoading(true);
    setError('');

    try {
      const result = await requestReconciliationItems(params);
      setItems(
        result.items.map((item) => ({
          ...item,
          draftPhysicalQty: item.physicalQty === null ? '' : String(item.physicalQty),
          draftNotes: item.notes ?? '',
        }))
      );
      setFamilyOptions(result.familyOptions);
      setCategoryOptions(result.categoryOptions);
    } catch (fetchError: unknown) {
      setItems([]);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : 'Failed to load reconciliation items.'
      );
    } finally {
      setIsLoading(false);
    }
  }

  const fetchItemsEffect = useEffectEvent(async () => {
    await loadItems({
      date: selectedDate,
      q: search,
      family,
      category,
    });
  });

  useEffect(() => {
    void fetchItemsEffect();
  }, [selectedDate, search, family, category]);

  const changedItems = useMemo(
    () =>
      items.filter((item) => {
        const nextPhysicalQty = normalizeDraftQuantity(item.draftPhysicalQty);
        const nextNotes = item.draftNotes.trim();
        const currentNotes = item.notes?.trim() || '';

        return nextPhysicalQty !== item.physicalQty || nextNotes !== currentNotes;
      }),
    [items]
  );

  function updateItemDraft(
    itemId: string,
    field: 'draftPhysicalQty' | 'draftNotes',
    value: string
  ) {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, [field]: value } : item))
    );
  }

  async function saveChanges() {
    if (!changedItems.length) {
      setStatus('No reconciliation changes to save.');
      setError('');
      return;
    }

    const invalidItem = changedItems.find((item) => Number.isNaN(normalizeDraftQuantity(item.draftPhysicalQty)));
    if (invalidItem) {
      setError(`Invalid physical count for ${invalidItem.sku}.`);
      setStatus('');
      return;
    }

    setIsSaving(true);
    setError('');
    setStatus('');

    try {
      const response = await fetch('/api/reconciliation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: selectedDate,
          counts: changedItems.map((item) => ({
            itemId: item.id,
            physicalQty: normalizeDraftQuantity(item.draftPhysicalQty),
            notes: item.draftNotes.trim() || null,
          })),
        }),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        savedCount?: number;
        clearedCount?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save reconciliation.');
      }

      setStatus(
        `Saved ${result.savedCount ?? 0} reconciliation count${
          (result.savedCount ?? 0) === 1 ? '' : 's'
        } for ${selectedDate}.${(result.clearedCount ?? 0) > 0 ? ` Cleared ${result.clearedCount} entr${(result.clearedCount ?? 0) === 1 ? 'y' : 'ies'}.` : ''}`
      );
      await loadItems();
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error ? saveError.message : 'Failed to save reconciliation.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-5 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-950">
            Reconciliation
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-neutral-700">
            Save end-of-day physical stock counts by date. These counts are stored as
            fixed point-in-time values, so later dispatch or sales imports can change
            computed stock movement without overwriting the physical count you recorded
            for that date.
          </p>
        </div>

        <div className="mb-4 grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_220px_220px_auto]">
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-sm text-neutral-950 shadow-sm"
          />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search SKU / Name"
            className="rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-sm text-neutral-950 shadow-sm placeholder:text-neutral-400"
          />
          <select
            value={family}
            onChange={(event) => setFamily(event.target.value)}
            className="rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-sm text-neutral-950 shadow-sm"
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
            className="rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-sm text-neutral-950 shadow-sm"
          >
            <option value="">All Categories</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {formatCategory(option)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void saveChanges()}
            disabled={isSaving || isLoading}
            className="rounded-2xl bg-neutral-950 px-4 py-4 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {isSaving ? 'Saving...' : 'Save changes'}
          </button>
        </div>

        <div className="mb-4 text-xs text-neutral-500">
          System balance is shown only as a reference. The saved physical count for{' '}
          <span className="font-mono">{selectedDate}</span> will stay fixed even if later
          dispatch data changes the calculated balance for that day.
        </div>

        {status ? (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {status}
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mb-4 text-sm text-neutral-600">
          {isLoading ? 'Loading reconciliation items...' : `${items.length} SKU${items.length === 1 ? '' : 's'} loaded.`}
          {changedItems.length ? ` ${changedItems.length} change${changedItems.length === 1 ? '' : 's'} pending.` : ''}
        </div>

        <div className="space-y-4 md:hidden">
          {items.map((item) => {
            const nextPhysicalQty = normalizeDraftQuantity(item.draftPhysicalQty);
            const varianceQty =
              nextPhysicalQty === null || Number.isNaN(nextPhysicalQty)
                ? item.varianceQty
                : nextPhysicalQty - item.balanceQty;

            return (
              <div
                key={item.id}
                className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">
                      {item.sku}
                    </div>
                    <div className="mt-2 break-words text-lg font-semibold leading-7 text-neutral-950">
                      {item.item_name}
                    </div>
                    <div className="mt-1 text-sm text-neutral-500">
                      {item.family || '—'} · {formatCategory(item.category)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-neutral-50 p-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                      System Balance
                    </div>
                    <div className="mt-1 text-sm font-semibold text-neutral-950">
                      {formatQuantity(item.balanceQty, item.default_unit)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                      Variance
                    </div>
                    <div className="mt-1 text-sm font-semibold text-neutral-950">
                      {formatQuantity(varianceQty, item.default_unit)}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                      Physical EOD Count
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={item.draftPhysicalQty}
                      onChange={(event) =>
                        updateItemDraft(item.id, 'draftPhysicalQty', event.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                      Notes
                    </div>
                    <input
                      type="text"
                      value={item.draftNotes}
                      onChange={(event) =>
                        updateItemDraft(item.id, 'draftNotes', event.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="hidden overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm md:block">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Family</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">System Balance</th>
                <th className="px-4 py-3 font-semibold">Physical EOD Count</th>
                <th className="px-4 py-3 font-semibold">Variance</th>
                <th className="px-4 py-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const nextPhysicalQty = normalizeDraftQuantity(item.draftPhysicalQty);
                const varianceQty =
                  nextPhysicalQty === null || Number.isNaN(nextPhysicalQty)
                    ? item.varianceQty
                    : nextPhysicalQty - item.balanceQty;

                return (
                  <tr
                    key={item.id}
                    className="border-t border-neutral-200 align-top transition hover:bg-stone-50"
                  >
                    <td className="px-4 py-3 font-medium text-neutral-700">{item.sku}</td>
                    <td className="px-4 py-3">{item.item_name}</td>
                    <td className="px-4 py-3">{item.family || '—'}</td>
                    <td className="px-4 py-3">{formatCategory(item.category)}</td>
                    <td className="px-4 py-3 font-semibold">
                      {formatQuantity(item.balanceQty, item.default_unit)}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={item.draftPhysicalQty}
                        onChange={(event) =>
                          updateItemDraft(item.id, 'draftPhysicalQty', event.target.value)
                        }
                        className="w-36 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                      />
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {formatQuantity(varianceQty, item.default_unit)}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={item.draftNotes}
                        onChange={(event) =>
                          updateItemDraft(item.id, 'draftNotes', event.target.value)
                        }
                        className="w-64 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!isLoading && items.length === 0 ? (
          <div className="mt-4 rounded-3xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center text-sm text-neutral-500">
            No SKUs match the current reconciliation filters.
          </div>
        ) : null}
      </div>
    </div>
  );
}
