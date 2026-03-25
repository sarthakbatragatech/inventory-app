'use client';

export function PrintPreviewActions() {
  return (
    <div className="mb-6 flex flex-wrap gap-3 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-2xl bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
      >
        Print
      </button>
      <button
        type="button"
        onClick={() => window.close()}
        className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50"
      >
        Close
      </button>
      <div className="self-center text-xs text-neutral-500">
        Use Print to open the browser&apos;s print preview for this BOM.
      </div>
    </div>
  );
}
