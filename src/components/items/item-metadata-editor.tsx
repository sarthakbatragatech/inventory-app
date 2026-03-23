'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type FamilyOption = {
  code: string;
  name: string | null;
};

type EditorData = {
  item: {
    id: string;
    sku: string;
    itemName: string;
    family: string;
    category: string;
  };
  familyOptions: FamilyOption[];
  categoryOptions: string[];
};

type Props = {
  itemId: string;
};

type UpdateResponse = {
  ok?: boolean;
  error?: string;
};

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z" />
    </svg>
  );
}

function formatCategoryLabel(category: string) {
  return category
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function ItemMetadataEditor({ itemId }: Props) {
  const router = useRouter();
  const [editorData, setEditorData] = useState<EditorData | null>(null);
  const [sku, setSku] = useState('');
  const [itemName, setItemName] = useState('');
  const [family, setFamily] = useState('');
  const [category, setCategory] = useState('raw_material');
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const hasChanges = editorData
    ? sku.trim() !== editorData.item.sku ||
      itemName.trim() !== editorData.item.itemName ||
      family !== editorData.item.family ||
      category !== editorData.item.category
    : false;

  async function loadEditorData() {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/items/${itemId}`, {
        cache: 'no-store',
      });
      const result = (await response.json()) as EditorData & { error?: string };

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load item details.');
      }

      setEditorData(result);
      setSku(result.item.sku);
      setItemName(result.item.itemName);
      setFamily(result.item.family);
      setCategory(result.item.category);
      setIsEditing(true);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load item details.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleStartEditing() {
    setMessage('');
    void loadEditorData();
  }

  function handleCancel() {
    if (editorData) {
      setSku(editorData.item.sku);
      setItemName(editorData.item.itemName);
      setFamily(editorData.item.family);
      setCategory(editorData.item.category);
    }

    setIsEditing(false);
    setMessage('');
    setError('');
  }

  function handleSave() {
    startTransition(() => {
      void fetch(`/api/items/${itemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku,
          itemName,
          family,
          category,
        }),
      })
        .then(async (response) => {
          const result = (await response.json()) as UpdateResponse;
          if (!response.ok) {
            throw new Error(result.error || 'Failed to update item.');
          }

          setMessage('Item details updated.');
          setError('');
          setIsEditing(false);
          router.refresh();
        })
        .catch((saveError: unknown) => {
          setError(saveError instanceof Error ? saveError.message : 'Failed to update item.');
          setMessage('');
        });
    });
  }

  return (
    <div className={isEditing ? 'mt-2 basis-full w-full' : 'contents'}>
      {isEditing && editorData ? (
        <div className="rounded-[1.35rem] border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white px-4 py-3 shadow-sm">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm font-semibold text-neutral-950">Edit Item Details</div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-400 hover:text-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || isPending}
                className="rounded-xl bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                {isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-x-4 gap-y-2 md:grid-cols-2 lg:grid-cols-[1.05fr_1.25fr_1.15fr_0.9fr]">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                SKU
              </span>
              <input
                type="text"
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-950 shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Item Name
              </span>
              <input
                type="text"
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
                className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-950 shadow-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Primary Family
              </span>
              <select
                value={family}
                onChange={(event) => setFamily(event.target.value)}
                className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-950 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
              >
                <option value="">Unknown</option>
                {editorData.familyOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name ? `${option.code} - ${option.name}` : option.code}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Category
              </span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-950 shadow-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              >
                {editorData.categoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatCategoryLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleStartEditing}
          disabled={isLoading}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-sky-200/80 bg-white/90 px-4 text-sm font-medium text-sky-900 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:shadow-md disabled:cursor-wait disabled:opacity-70"
        >
          <PencilIcon />
          <span>{isLoading ? 'Loading…' : 'Edit details'}</span>
        </button>
      )}

      {message || error ? (
        <div className="mt-2 min-h-5 basis-full text-sm">
          {message ? <div className="text-emerald-700">{message}</div> : null}
          {error ? <div className="text-rose-700">{error}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
