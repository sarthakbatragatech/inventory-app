import { getStockSnapshotByFgSku, listStockModels } from '@/lib/stock';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{
    fgSku?: string;
    q?: string;
    family?: string;
  }>;
};

function formatQuantity(quantity: number, unit: string | null) {
  const rounded = quantity.toFixed(2).replace(/\.?0+$/, '');
  return unit ? `${rounded} ${unit}` : rounded;
}

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function deriveModelFamily(fgSku: string, fgName: string | null) {
  const skuMatch = fgSku.trim().toUpperCase().match(/^([A-Z]{1,3}-\d{2,4})\b/);
  if (skuMatch) {
    return skuMatch[1];
  }

  const nameMatch = (fgName ?? '').trim().toUpperCase().match(/^([A-Z]{1,3}-\d{2,4})\b/);
  return nameMatch?.[1] ?? '';
}

export default async function ModelAnalysisPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const models = await listStockModels();
  const selectedFamily = params.family?.trim() || '';
  const modelsWithFamily = models.map((model) => ({
    ...model,
    family: deriveModelFamily(model.fg_sku, model.fg_name),
  }));
  const familyOptions = [
    ...new Set(
      modelsWithFamily
        .map((model) => model.family)
        .filter((family): family is string => Boolean(family))
    ),
  ].sort((left, right) => left.localeCompare(right));
  const filteredModels = selectedFamily
    ? modelsWithFamily.filter((model) => model.family === selectedFamily)
    : modelsWithFamily;
  const hasAnyModels = modelsWithFamily.length > 0;
  const requestedFgSku = params.fgSku?.trim() || '';
  const selectedFgSku = filteredModels.some((model) => model.fg_sku === requestedFgSku)
    ? requestedFgSku
    : filteredModels[0]?.fg_sku || '';
  const query = params.q?.trim().toLowerCase() || '';
  const snapshot = selectedFgSku ? await getStockSnapshotByFgSku(selectedFgSku) : null;

  const filteredComponents = snapshot
    ? snapshot.components.filter((component) => {
        if (!query) {
          return true;
        }

        const haystack =
          `${component.componentSku} ${component.componentName}`.toLowerCase();
        return haystack.includes(query);
      })
    : [];

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-5 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 sm:mb-6">
          <h1 className="mb-2 text-4xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
            Model Analysis
          </h1>
          <p className="max-w-3xl text-base leading-8 text-neutral-700 sm:text-sm sm:leading-6">
            Analyze a single model&apos;s BOM against inward and all-model consumption.
          </p>
        </div>

        <form className="mb-5 grid gap-3 md:mb-4 md:grid-cols-[minmax(0,1fr)_220px_320px_140px_160px]">
          <input
            type="text"
            name="q"
            defaultValue={params.q || ''}
            placeholder="Search component SKU / Name"
            className="rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-base text-neutral-950 shadow-sm placeholder:text-neutral-400 sm:rounded-xl sm:p-3 sm:text-sm"
          />

          <select
            name="family"
            defaultValue={selectedFamily}
            className="rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-base text-neutral-950 shadow-sm sm:rounded-xl sm:p-3 sm:text-sm"
          >
            <option value="">All Families</option>
            {familyOptions.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>

          <select
            name="fgSku"
            defaultValue={selectedFgSku}
            className="rounded-2xl border border-neutral-300 bg-white px-4 py-4 text-base text-neutral-950 shadow-sm sm:rounded-xl sm:p-3 sm:text-sm"
          >
            {filteredModels.map((model) => (
              <option key={model.id} value={model.fg_sku}>
                {model.fg_name ? `${model.fg_sku} - ${model.fg_name}` : model.fg_sku}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="rounded-2xl bg-neutral-950 px-4 py-4 text-base font-medium text-white shadow-sm transition hover:bg-neutral-800 sm:rounded-xl sm:p-3 sm:text-sm"
          >
            Apply
          </button>

          <a
            href={snapshot ? `/bom/print?fgSku=${encodeURIComponent(snapshot.fgSku)}` : '#'}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center justify-center rounded-2xl border px-4 py-4 text-base font-medium transition sm:rounded-xl sm:p-3 sm:text-sm ${
              snapshot
                ? 'border-neutral-300 bg-white text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50'
                : 'pointer-events-none border-neutral-200 bg-neutral-100 text-neutral-400'
            }`}
          >
            Print Preview
          </a>
        </form>

        {!snapshot ? (
          <div className="rounded-3xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-sm text-neutral-500">
            {hasAnyModels
              ? 'No BOM models match the current family filter.'
              : 'No BOM models exist yet.'}
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-3xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_0.8fr_0.8fr_0.8fr]">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                    Model
                  </div>
                  <div className="mt-1 truncate text-lg font-semibold text-neutral-950">
                    {snapshot.fgName || snapshot.fgSku}
                  </div>
                  <div className="text-xs text-neutral-500">{snapshot.fgSku}</div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                    Sales Qty
                  </div>
                  <div className="mt-1 text-base font-semibold text-neutral-950">
                    {formatQuantity(snapshot.salesQty, 'pcs')}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                    Sales From
                  </div>
                  <div className="mt-1 text-base font-semibold text-neutral-950">
                    {formatDate(snapshot.salesDateFrom)}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                    Sales To
                  </div>
                  <div className="mt-1 text-base font-semibold text-neutral-950">
                    {formatDate(snapshot.salesDateTo)}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 md:hidden">
              {filteredComponents.map((component) => (
                <div
                  key={component.componentItemId}
                  className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">
                        {component.componentSku}
                      </div>
                      <div className="mt-2 break-words text-lg font-semibold leading-7 text-neutral-950">
                        {component.componentName}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
                        component.balanceQty < component.reorderThresholdQty
                          ? 'border-rose-200 bg-rose-100 text-rose-800'
                          : 'border-emerald-200 bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {component.balanceQty < component.reorderThresholdQty ? 'Reorder' : 'Healthy'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 rounded-2xl bg-neutral-50 p-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        Inward
                      </div>
                      <div className="mt-1 text-sm font-semibold text-neutral-950">
                        {formatQuantity(component.inwardQty, component.unit)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        Selected Model
                      </div>
                      <div className="mt-1 text-sm font-semibold text-neutral-950">
                        {formatQuantity(component.selectedModelConsumedQty, component.unit)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        All Models
                      </div>
                      <div className="mt-1 text-sm font-semibold text-neutral-950">
                        {formatQuantity(component.consumedQty, component.unit)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        Balance
                      </div>
                      <div
                        className={`mt-1 text-sm font-semibold ${
                          component.balanceQty < component.reorderThresholdQty
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatQuantity(component.balanceQty, component.unit)}
                      </div>
                    </div>
                    <div className="col-span-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-600">
                        Reorder Threshold
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={component.reorderThresholdQty.toFixed(2)}
                        className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm md:block">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-100 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Component SKU</th>
                    <th className="px-4 py-3 font-semibold">Component</th>
                    <th className="px-4 py-3 font-semibold">Inward</th>
                    <th className="px-4 py-3 font-semibold">Selected Model</th>
                    <th className="px-4 py-3 font-semibold">All Models</th>
                    <th className="px-4 py-3 font-semibold">Reorder Threshold</th>
                    <th className="px-4 py-3 font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredComponents.map((component) => (
                    <tr
                      key={component.componentItemId}
                      className="border-t border-neutral-200 transition hover:bg-sky-50/70"
                    >
                      <td className="px-4 py-3 font-medium text-neutral-700">
                        {component.componentSku}
                      </td>
                      <td className="px-4 py-3">{component.componentName}</td>
                      <td className="px-4 py-3 font-semibold">
                        {formatQuantity(component.inwardQty, component.unit)}
                      </td>
                      <td className="px-4 py-3">
                        {formatQuantity(component.selectedModelConsumedQty, component.unit)}
                      </td>
                      <td className="px-4 py-3">
                        {formatQuantity(component.consumedQty, component.unit)}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={component.reorderThresholdQty.toFixed(2)}
                          className="w-28 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                        />
                      </td>
                      <td
                        className={`px-4 py-3 font-semibold ${
                          component.balanceQty < component.reorderThresholdQty
                            ? 'text-rose-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatQuantity(component.balanceQty, component.unit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredComponents.length === 0 ? (
              <div className="mt-4 rounded-3xl border border-dashed border-neutral-300 bg-white px-6 py-10 text-center text-sm text-neutral-500">
                No model-analysis rows match the current filters.
              </div>
            ) : null}

          </>
        )}
      </div>
    </div>
  );
}
