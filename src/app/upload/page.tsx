'use client';

import Link from 'next/link';
import { useState } from 'react';
import { UploadResponse } from '@/types/inventory';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importedOnDate, setImportedOnDate] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!file) {
      setMessage('Please choose a file');
      return;
    }

    setLoading(true);
    setMessage('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      if (importedOnDate.trim()) {
        formData.append('importedOnDate', importedOnDate.trim());
      }

      if (notes.trim()) {
        formData.append('notes', notes.trim());
      }

      const res = await fetch('/api/upload-inward', {
        method: 'POST',
        body: formData,
      });

      const rawText = await res.text();

      let data: UploadResponse | null = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        setMessage(data?.error || rawText || `Upload failed with status ${res.status}`);
        return;
      }

      setResult(data);
      setMessage(
        data?.rowsImported
          ? `Upload successful. Imported ${data.rowsImported} rows.`
          : 'Upload successful.'
      );

      setFile(null);
      setImportedOnDate('');
      setNotes('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-2xl rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Upload Inward Excel</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Upload a new inward file. Old uploads remain unchanged as historical batches.
        </p>

        <form onSubmit={handleUpload} className="mt-6 space-y-4">
          <input
            key={file ? file.name : 'empty'}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full rounded-xl border border-neutral-300 p-3"
          />

          <input
            type="date"
            value={importedOnDate}
            onChange={(e) => setImportedOnDate(e.target.value)}
            className="block w-full rounded-xl border border-neutral-300 p-3"
          />

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
            className="block min-h-[120px] w-full rounded-xl border border-neutral-300 p-3"
          />

          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-black px-5 py-3 text-white disabled:opacity-50"
          >
            {loading ? 'Uploading...' : 'Upload Excel'}
          </button>
        </form>

        {message ? (
          <div className="mt-4 rounded-xl bg-neutral-100 p-3 text-sm">
            {message}
          </div>
        ) : null}

        {result?.success ? (
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
            <div className="font-medium text-neutral-900">Import Summary</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-3">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Rows Imported</div>
                <div className="mt-1 text-2xl font-semibold">{result.rowsImported}</div>
              </div>
              <div className="rounded-xl bg-white p-3">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Unique Items</div>
                <div className="mt-1 text-2xl font-semibold">{result.uniqueItemsMatched ?? '-'}</div>
              </div>
              <div className="rounded-xl bg-white p-3">
                <div className="text-xs uppercase tracking-wide text-neutral-500">New Items Created</div>
                <div className="mt-1 text-2xl font-semibold">{result.newItemsCreated ?? 0}</div>
              </div>
              <div className="rounded-xl bg-white p-3">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Aliases Created</div>
                <div className="mt-1 text-2xl font-semibold">{result.aliasesCreated ?? 0}</div>
              </div>
              <div className="rounded-xl bg-white p-3">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Rows Replaced</div>
                <div className="mt-1 text-2xl font-semibold">{result.overwrittenRows ?? 0}</div>
              </div>
              <div className="rounded-xl bg-white p-3">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Dates Replaced</div>
                <div className="mt-1 text-2xl font-semibold">{result.overwrittenDates ?? 0}</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-neutral-500">Batch ID: {result.batchId}</div>
            {(result.overwrittenRows ?? 0) > 0 ? (
              <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sky-900">
                Existing inward data for overlapping dates was replaced with this upload,
                so accountant corrections and previously missing rows are now reflected.
              </div>
            ) : null}
          </div>
        ) : null}

        {result?.success && (result.newItemsCreated ?? 0) > 0 ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <div className="font-medium text-amber-950">New SKU follow-up required</div>
            <p className="mt-2 text-amber-900">
              This inward file created {result.newItemsCreated} new SKU
              {result.newItemsCreated === 1 ? '' : 's'}. Review these items so the
              right BOMs can be updated and each item can be tagged to the correct
              family.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/bom"
                className="rounded-xl bg-amber-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-800"
              >
                Review BOMs
              </Link>
              <Link
                href="/items"
                className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-100"
              >
                Review Items
              </Link>
            </div>

            <div className="mt-4 space-y-2">
              {(result.newItems ?? []).map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-amber-200 bg-white px-3 py-3"
                >
                  <div className="font-medium text-neutral-950">{item.sku}</div>
                  <div className="mt-1 text-neutral-700">{item.itemName}</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    Family: {item.family || 'Needs family tagging'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
