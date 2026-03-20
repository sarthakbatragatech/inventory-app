import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-semibold">Inventory Control</h1>
        <p className="mt-2 text-neutral-600">
          SKU master, inward imports, and searchable item history.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Link href="/upload" className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-lg font-medium">Upload inward Excel</div>
            <div className="mt-2 text-sm text-neutral-600">
              Add a new inward batch from employee-maintained Excel.
            </div>
          </Link>

          <Link href="/items" className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-lg font-medium">Browse SKUs</div>
            <div className="mt-2 text-sm text-neutral-600">
              Search by SKU, item name, and aliases.
            </div>
          </Link>

          <Link href="/imports" className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-lg font-medium">Import history</div>
            <div className="mt-2 text-sm text-neutral-600">
              See all uploaded Excel batches.
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}