import Link from 'next/link';
import { Brand } from '@/components/brand';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-8 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <Brand />
          <p className="mt-5 max-w-2xl text-base leading-7 text-neutral-700">
            SKU master, inward imports, searchable item history, and cleaner stock
            visibility for the Tycoon workflow.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Link href="/upload" className="rounded-3xl border border-neutral-200 bg-neutral-50 p-6 shadow-sm transition hover:border-neutral-300 hover:bg-white">
              <div className="text-lg font-medium text-neutral-950">Upload inward Excel</div>
              <div className="mt-2 text-sm text-neutral-700">
                Add a new inward batch from employee-maintained Excel.
              </div>
            </Link>

            <Link href="/items" className="rounded-3xl border border-neutral-200 bg-neutral-50 p-6 shadow-sm transition hover:border-neutral-300 hover:bg-white">
              <div className="text-lg font-medium text-neutral-950">Inward</div>
              <div className="mt-2 text-sm text-neutral-700">
                Review inwarded SKUs, quantities, and latest receipts.
              </div>
            </Link>

            <Link href="/imports" className="rounded-3xl border border-neutral-200 bg-neutral-50 p-6 shadow-sm transition hover:border-neutral-300 hover:bg-white">
              <div className="text-lg font-medium text-neutral-950">Import history</div>
              <div className="mt-2 text-sm text-neutral-700">
                See all uploaded Excel batches.
              </div>
            </Link>

            <Link href="/bom" className="rounded-3xl border border-neutral-200 bg-neutral-50 p-6 shadow-sm transition hover:border-neutral-300 hover:bg-white">
              <div className="text-lg font-medium text-neutral-950">Manage BOMs</div>
              <div className="mt-2 text-sm text-neutral-700">
                Map finished-good models to the component SKUs they consume.
              </div>
            </Link>

            <Link href="/stock" className="rounded-3xl border border-neutral-200 bg-neutral-50 p-6 shadow-sm transition hover:border-neutral-300 hover:bg-white">
              <div className="text-lg font-medium text-neutral-950">Stock</div>
              <div className="mt-2 text-sm text-neutral-700">
                Review inventory-wide inward, sales consumption, and current balance.
              </div>
            </Link>

            <Link href="/model-analysis" className="rounded-3xl border border-neutral-200 bg-neutral-50 p-6 shadow-sm transition hover:border-neutral-300 hover:bg-white">
              <div className="text-lg font-medium text-neutral-950">Model analysis</div>
              <div className="mt-2 text-sm text-neutral-700">
                Drill into a single model&apos;s BOM-based component usage.
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
