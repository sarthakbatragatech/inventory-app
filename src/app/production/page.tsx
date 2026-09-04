import { ProductionWorkspace } from '@/components/production/production-workspace';
import { FR_CRUZER_COLORS, FR_CRUZER_SKU } from '@/lib/production';

export const dynamic = 'force-dynamic';

export default function ProductionPage() {
  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-6 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.14),transparent_30%),linear-gradient(180deg,#ffffff,#f8fafc)] p-6 shadow-sm sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)] lg:items-end">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                Factory control · {FR_CRUZER_SKU}
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">
                FR-Cruzer production &amp; availability
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-neutral-600">
                Record colour-wise fitter and box output, compare packed stock with synced sales
                and open Tycoon orders, and see how many units the current BOM inventory can support.
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white/90 p-4 text-sm leading-6 text-neutral-600 shadow-sm">
              Sales are not colour-wise. This screen therefore keeps the production mix by
              colour, while finished-goods balance remains a reliable model-level total only.
            </div>
          </div>
        </section>

        <ProductionWorkspace
          fgSku={FR_CRUZER_SKU}
          colors={[...FR_CRUZER_COLORS]}
        />
      </div>
    </div>
  );
}
