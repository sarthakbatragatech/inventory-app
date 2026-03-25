'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type ItemOption = {
  id: string;
  sku: string;
  item_name: string;
  default_unit: string | null;
};

type HistoryRow = {
  id: string;
  batch_id: string;
  raw_row_no: number;
  raw_item_name: string;
  quantity: number | null;
  unit: string | null;
  displayUnit: string | null;
  color: string | null;
  inward_date: string | null;
  supplier: string | null;
  batch: {
    id: string;
    file_name: string;
    uploaded_at: string;
    status: string;
  } | null;
};

type EditableRow = {
  itemSearch: string;
  itemId: string;
  rawItemName: string;
  inwardDate: string;
  quantity: string;
  unit: string;
  color: string;
  persistAlias: boolean;
};

type Props = {
  currentItemId: string;
  currentItemSku: string;
  rows: HistoryRow[];
  itemOptions: ItemOption[];
};

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

function buildEditableRow(currentItemId: string, currentItemSku: string, row: HistoryRow): EditableRow {
  return {
    itemSearch: currentItemSku,
    itemId: currentItemId,
    rawItemName: row.raw_item_name || '',
    inwardDate: row.inward_date || '',
    quantity: row.quantity === null || row.quantity === undefined ? '' : String(row.quantity),
    unit: row.unit || '',
    color: row.color || '',
    persistAlias: false,
  };
}

function getFilteredItemOptions(itemOptions: ItemOption[], draft: EditableRow) {
  const query = draft.itemSearch.trim().toLowerCase();
  const options = query
    ? itemOptions.filter((option) =>
        `${option.sku} ${option.item_name}`.toLowerCase().includes(query)
      )
    : itemOptions;

  return options.slice(0, 12);
}

export function InwardHistoryEditor({
  currentItemId,
  currentItemSku,
  rows,
  itemOptions,
}: Props) {
  const router = useRouter();
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditableRow | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function startEditing(row: HistoryRow) {
    setEditingRowId(row.id);
    setDraft(buildEditableRow(currentItemId, currentItemSku, row));
    setStatus('');
    setError('');
  }

  function cancelEditing() {
    setEditingRowId(null);
    setDraft(null);
    setError('');
  }

  function updateDraft(field: keyof EditableRow, value: string) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  function updatePersistAlias(value: boolean) {
    setDraft((current) => (current ? { ...current, persistAlias: value } : current));
  }

  function applyItem(itemId: string) {
    const item = itemOptions.find((option) => option.id === itemId);
    setDraft((current) =>
      current
        ? {
            ...current,
            itemId,
            itemSearch: item ? `${item.sku} - ${item.item_name}` : current.itemSearch,
            unit: current.unit || item?.default_unit || '',
          }
        : current
    );
  }

  function saveRow(rowId: string) {
    if (!draft) {
      return;
    }

    startTransition(() => {
      void fetch(`/api/inward-history/${rowId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          itemId: draft.itemId,
          rawItemName: draft.rawItemName,
          inwardDate: draft.inwardDate,
          quantity: Number(draft.quantity),
          unit: draft.unit || null,
          color: draft.color || null,
          persistAlias: draft.persistAlias,
        }),
      })
        .then(async (response) => {
          const result = (await response.json()) as {
            ok?: boolean;
            item?: { sku: string };
            itemId?: string;
            previousItemId?: string;
            aliasUpdated?: boolean;
            error?: string;
          };

          if (!response.ok) {
            throw new Error(result.error || 'Failed to update inward row.');
          }

          setStatus(
            result.aliasUpdated
              ? `Updated inward row and saved "${draft.rawItemName}" for future inward matching to ${result.item?.sku || 'the selected SKU'}.`
              : result.itemId && result.itemId !== result.previousItemId
                ? `Updated row and reassigned it to ${result.item?.sku || 'the selected SKU'}.`
                : 'Updated inward row.'
          );
          setError('');
          setEditingRowId(null);
          setDraft(null);
          router.refresh();
        })
        .catch((saveError: unknown) => {
          setError(
            saveError instanceof Error ? saveError.message : 'Failed to update inward row.'
          );
          setStatus('');
        });
    });
  }

  return (
    <>
      {status ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-3 text-sm text-emerald-700">
          {status}
        </div>
      ) : null}

      {error ? (
        <div className="border-b border-rose-200 bg-rose-50 px-6 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <table className="min-w-[1200px] w-full table-fixed text-sm">
        <thead className="bg-neutral-100 text-left text-neutral-700">
          <tr>
            <th className="w-40 px-4 py-3 font-semibold">Date</th>
            <th className="w-44 px-4 py-3 font-semibold">Quantity</th>
            <th className="w-44 px-4 py-3 font-semibold">Supplier</th>
            <th className="w-36 px-4 py-3 font-semibold">Color / Type</th>
            <th className="w-44 px-4 py-3 font-semibold">Imported As</th>
            <th className="w-80 px-4 py-3 font-semibold">Mapped SKU</th>
            <th className="w-44 px-4 py-3 font-semibold">Source File</th>
            <th className="w-32 px-4 py-3 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isEditing = editingRowId === row.id && draft;
            const filteredOptions = isEditing ? getFilteredItemOptions(itemOptions, draft) : [];

            return (
              <tr key={row.id} className="border-t border-neutral-200 align-top">
                <td className="px-4 py-3 text-neutral-700">
                  {isEditing ? (
                    <input
                      type="date"
                      value={draft.inwardDate}
                      onChange={(event) => updateDraft('inwardDate', event.target.value)}
                      className="w-40 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                    />
                  ) : row.inward_date ? (
                    formatInwardDate(row.inward_date)
                  ) : (
                    <span className="text-amber-700">Missing date</span>
                  )}
                </td>
                <td className="px-4 py-3 font-medium text-neutral-950">
                  {isEditing ? (
                    <div className="flex items-start gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={draft.quantity}
                        onChange={(event) => updateDraft('quantity', event.target.value)}
                        className="w-24 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                      />
                      <input
                        type="text"
                        value={draft.unit}
                        onChange={(event) => updateDraft('unit', event.target.value)}
                        className="w-16 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                      />
                    </div>
                  ) : row.quantity !== null && row.quantity !== undefined ? (
                    formatQuantity(row.quantity, row.displayUnit)
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-700">{row.supplier || '—'}</td>
                <td className="px-4 py-3 text-neutral-700">
                  {isEditing ? (
                    <input
                      type="text"
                      value={draft.color}
                      onChange={(event) => updateDraft('color', event.target.value)}
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                    />
                  ) : (
                    row.color || '—'
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-700">
                  {isEditing ? (
                    <input
                      type="text"
                      value={draft.rawItemName}
                      onChange={(event) => updateDraft('rawItemName', event.target.value)}
                      className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                    />
                  ) : (
                    row.raw_item_name || '—'
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-700">
                  {isEditing ? (
                    <div className="w-72 max-w-full">
                      <input
                        type="text"
                        value={draft.itemSearch}
                        onChange={(event) => updateDraft('itemSearch', event.target.value)}
                        placeholder="Search SKU or item name"
                        className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                      />
                      <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50">
                        {filteredOptions.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => applyItem(option.id)}
                            className={`block w-full px-3 py-2 text-left text-xs transition ${
                              option.id === draft.itemId
                                ? 'bg-sky-100 text-sky-950'
                                : 'text-neutral-700 hover:bg-white'
                            }`}
                          >
                            <span className="break-words font-medium">{option.sku}</span>
                            <span className="text-neutral-500"> {' '}· {option.item_name}</span>
                          </button>
                        ))}
                        {filteredOptions.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-neutral-500">No SKU matches.</div>
                        ) : null}
                      </div>
                      <label className="mt-2 flex max-w-72 items-start gap-2 text-xs leading-5 text-neutral-600">
                        <input
                          type="checkbox"
                          checked={draft.persistAlias}
                          onChange={(event) => updatePersistAlias(event.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-neutral-300"
                        />
                        <span>
                          Use this <span className="font-medium">Imported As</span> value for
                          future inward matching.
                        </span>
                      </label>
                    </div>
                  ) : (
                    <span className="break-words">{currentItemSku}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-700">
                  <div className="break-words">{row.batch?.file_name || '—'}</div>
                  <div className="text-xs text-neutral-500">Row {row.raw_row_no}</div>
                </td>
                <td className="px-4 py-3">
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => saveRow(row.id)}
                        disabled={isPending}
                        className="rounded-xl bg-sky-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-200"
                      >
                        {isPending ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        disabled={isPending}
                        className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEditing(row)}
                      className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
