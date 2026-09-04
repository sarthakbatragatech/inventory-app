'use client';

import Image from 'next/image';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type ProductionEntry = {
  id: string;
  production_date: string;
  color_variant: string;
  quantity: number;
  packed_quantity: number;
  report_reference: string | null;
  notes: string | null;
};

type ComponentReadiness = {
  componentItemId: string;
  componentSku: string;
  componentName: string;
  unit: string | null;
  qtyPerFg: number;
  availableQty: number;
  buildableQty: number;
  requiredForOpenOrdersQty: number;
  shortageForOpenOrdersQty: number;
  isLimiting: boolean;
  photoUrl: string | null;
  lastInwardDate: string | null;
  lastInwardQty: number | null;
  lastInwardUnit: string | null;
};

type ProductionDashboard = {
  fgSku: string;
  fgName: string | null;
  bomModelId: string | null;
  bomVersionId: string | null;
  bomVersionNo: number | null;
  bomEffectiveFrom: string | null;
  bomLineCount: number;
  variantBomLineCount: number;
  productionEntries: ProductionEntry[];
  colorSummary: Array<{ color: string; quantity: number; packedQuantity: number }>;
  colorCapacity: Array<{
    color: string;
    buildableQty: number | null;
    limitingComponentNames: string[];
  }>;
  productionTotalQty: number;
  packedTotalQty: number;
  workInProgressQty: number;
  salesRows: Array<{ saleDate: string; quantity: number }>;
  salesTotalQty: number;
  reportedFinishedGoodsQty: number;
  pendingOrderRows: Array<{ referenceDate: string; quantity: number }>;
  pendingOrderQty: number;
  pendingAfterFinishedGoodsQty: number;
  buildableQty: number | null;
  recommendedBuildQty: number | null;
  componentReadiness: ComponentReadiness[];
};

type Props = {
  fgSku: string;
  colors: string[];
};

function getToday() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }

  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatQuantity(value: number, unit?: string | null) {
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

function ComponentPhoto({ component }: { component: ComponentReadiness }) {
  return (
    <div className="group relative flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-neutral-200 bg-[radial-gradient(circle_at_top,#ffffff_0%,#f5f5f4_72%)] shadow-[0_8px_22px_-14px_rgba(23,23,23,0.55)] ring-1 ring-white">
      {component.photoUrl ? (
        <Image
          src={component.photoUrl}
          alt=""
          width={160}
          height={120}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
        />
      ) : (
        <div className="flex flex-col items-center gap-1 text-neutral-400" aria-label="Photo not available">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h2l1-1.5h7L16.5 6h2A1.5 1.5 0 0 1 20 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
            <circle cx="12" cy="12.5" r="3.25" />
          </svg>
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em]">No photo</span>
        </div>
      )}
    </div>
  );
}

export function ProductionWorkspace({ fgSku, colors }: Props) {
  const [dashboard, setDashboard] = useState<ProductionDashboard | null>(null);
  const [productionDate, setProductionDate] = useState(getToday);
  const [colorVariant, setColorVariant] = useState(colors[0] ?? '');
  const [quantity, setQuantity] = useState('');
  const [packedQuantity, setPackedQuantity] = useState('');
  const [reportReference, setReportReference] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const loadDashboard = useCallback(async () => {
    const response = await fetch(`/api/production?fgSku=${encodeURIComponent(fgSku)}`, {
      cache: 'no-store',
    });
    const payload = (await response.json()) as {
      dashboard?: ProductionDashboard;
      error?: string;
    };

    if (!response.ok || !payload.dashboard) {
      throw new Error(payload.error || 'Failed to load production dashboard.');
    }

    setDashboard(payload.dashboard);
  }, [fgSku]);

  useEffect(() => {
    let cancelled = false;

    void loadDashboard()
      .then(() => {
        if (!cancelled) {
          setError('');
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : 'Failed to load production dashboard.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadDashboard]);

  async function saveProduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    setStatus('');

    try {
      const response = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fgSku,
          productionDate,
          colorVariant,
          quantity: Number(quantity),
          packedQuantity: Number(packedQuantity || 0),
          reportReference: reportReference || null,
          notes: notes || null,
        }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save production.');
      }

      await loadDashboard();
      setQuantity('');
      setPackedQuantity('');
      setReportReference('');
      setNotes('');
      setStatus(
        `Recorded ${quantity || 0} assembled and ${packedQuantity || 0} packed ${fgSku} in ${colorVariant}.`
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save production.');
    } finally {
      setIsSaving(false);
    }
  }

  async function syncSales() {
    setIsSyncing(true);
    setError('');
    setStatus('');

    try {
      const response = await fetch('/api/sync-sales?all=true', { method: 'POST' });
      const payload = (await response.json()) as { upserted?: number; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to sync Tycoon sales.');
      }

      await loadDashboard();
      setStatus(`Sales refreshed from the Tycoon portal (${payload.upserted ?? 0} rows).`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Failed to sync Tycoon sales.');
    } finally {
      setIsSyncing(false);
    }
  }

  async function removeEntry(entry: ProductionEntry) {
    const confirmed = window.confirm(
      `Delete ${entry.quantity} assembled and ${entry.packed_quantity} packed ${fgSku} (${entry.color_variant}) from ${formatDate(entry.production_date)}?`
    );
    if (!confirmed) {
      return;
    }

    setDeletingEntryId(entry.id);
    setError('');
    setStatus('');

    try {
      const response = await fetch(`/api/production/${entry.id}`, { method: 'DELETE' });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete production entry.');
      }

      await loadDashboard();
      setStatus('Production entry deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete entry.');
    } finally {
      setDeletingEntryId('');
    }
  }

  const totalColorProduction = useMemo(
    () => dashboard?.colorSummary.reduce((sum, row) => sum + row.quantity, 0) ?? 0,
    [dashboard]
  );
  const colorCapacityByColor = useMemo(
    () => new Map((dashboard?.colorCapacity ?? []).map((row) => [row.color, row])),
    [dashboard]
  );

  if (isLoading) {
    return (
      <div className="rounded-[2rem] border border-neutral-200 bg-white p-10 text-center text-neutral-500 shadow-sm">
        Loading FR-Cruzer production, stock, sales, and orders…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {status ? (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {status}
        </div>
      ) : null}

      {!dashboard?.bomModelId || !dashboard.bomVersionId || dashboard.bomLineCount === 0 ? (
        <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
            Setup required
          </div>
          <h2 className="mt-2 text-xl font-semibold text-amber-950">Complete the FR-Cruzer BOM</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-900/80">
            Production can be recorded now, but “quantity you can make” needs an effective BOM
            version with its moulded, electrical, packaging, and other component SKUs.
          </p>
          <a
            href={`/bom?fgSku=${encodeURIComponent(fgSku)}`}
            className="mt-4 inline-flex rounded-full bg-amber-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800"
          >
            Open FR-Cruzer BOM
          </a>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Can make now',
            value: dashboard?.buildableQty === null ? 'Set BOM' : formatQuantity(dashboard?.buildableQty ?? 0),
            detail: 'Limited by current component stock',
            tone: 'border-emerald-200 bg-emerald-50',
          },
          {
            label: 'Recommended build',
            value:
              dashboard?.recommendedBuildQty === null
                ? 'Set BOM'
                : formatQuantity(dashboard?.recommendedBuildQty ?? 0),
            detail: 'Open orders after reported FG stock',
            tone: 'border-sky-200 bg-sky-50',
          },
          {
            label: 'Orders in hand',
            value: formatQuantity(dashboard?.pendingOrderQty ?? 0),
            detail: 'Live pending Tycoon portal quantity',
            tone: 'border-violet-200 bg-violet-50',
          },
          {
            label: 'Reported FG stock',
            value: formatQuantity(dashboard?.reportedFinishedGoodsQty ?? 0),
            detail: 'Packed units minus synced sales',
            tone: 'border-amber-200 bg-amber-50',
          },
          {
            label: 'Assembled',
            value: formatQuantity(dashboard?.productionTotalQty ?? 0),
            detail: 'Fitter-stage output across colours',
            tone: 'border-neutral-200 bg-white',
          },
          {
            label: 'Packed',
            value: formatQuantity(dashboard?.packedTotalQty ?? 0),
            detail: 'Box-stage output across colours',
            tone: 'border-neutral-200 bg-white',
          },
          {
            label: 'Assembly WIP',
            value: formatQuantity(dashboard?.workInProgressQty ?? 0),
            detail: 'Assembled minus packed',
            tone: 'border-neutral-200 bg-white',
          },
          {
            label: 'Sold',
            value: formatQuantity(dashboard?.salesTotalQty ?? 0),
            detail: 'Imported or synced model-level sales',
            tone: 'border-neutral-200 bg-white',
          },
        ].map((card) => (
          <div key={card.label} className={`rounded-2xl border p-4 shadow-sm ${card.tone}`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              {card.label}
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{card.value}</div>
            <div className="mt-2 text-xs leading-5 text-neutral-500">{card.detail}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <form onSubmit={saveProduction} className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Production report
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
                Record assembled units
              </h2>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              Colour-wise
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-neutral-700">
              Production date
              <input
                type="date"
                required
                value={productionDate}
                onChange={(event) => setProductionDate(event.target.value)}
                className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-neutral-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="text-sm font-medium text-neutral-700">
              Assembled / fitter quantity
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="e.g. 50"
                className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-neutral-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="text-sm font-medium text-neutral-700">
              Packed / box quantity
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={packedQuantity}
                onChange={(event) => setPackedQuantity(event.target.value)}
                placeholder="e.g. 40"
                className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-neutral-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="text-sm font-medium text-neutral-700 sm:col-span-2">
              Colour
              <select
                required
                value={colorVariant}
                onChange={(event) => setColorVariant(event.target.value)}
                className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-neutral-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {colors.map((color) => (
                  <option key={color} value={color}>{color}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-neutral-700 sm:col-span-2">
              Report / batch reference <span className="font-normal text-neutral-400">(optional)</span>
              <input
                value={reportReference}
                onChange={(event) => setReportReference(event.target.value)}
                placeholder="Shift, report, or batch number"
                className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-neutral-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="text-sm font-medium text-neutral-700 sm:col-span-2">
              Notes <span className="font-normal text-neutral-400">(optional)</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Assembly or quality note"
                className="mt-2 w-full resize-y rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-neutral-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-5 w-full rounded-full bg-neutral-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving production…' : 'Add to production report'}
          </button>
        </form>

        <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
                Production mix
              </div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
                Colour-wise output
              </h2>
            </div>
            <div className="text-sm text-neutral-500">Total {formatQuantity(totalColorProduction)} pcs</div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {(dashboard?.colorSummary ?? colors.map((color) => ({ color, quantity: 0, packedQuantity: 0 }))).map((row, index) => {
              const share = totalColorProduction > 0 ? (row.quantity / totalColorProduction) * 100 : 0;
              const capacity = colorCapacityByColor.get(row.color);
              const barColors = ['bg-rose-500', 'bg-cyan-500', 'bg-stone-400', 'bg-lime-800'];
              return (
                <div key={row.color} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-neutral-900">{row.color}</div>
                    <div className="text-lg font-semibold text-neutral-950">{formatQuantity(row.quantity)}</div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200">
                    <div
                      className={`h-full rounded-full ${barColors[index % barColors.length]}`}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-neutral-500">{share.toFixed(1)}% of production</div>
                  <div className="mt-1 text-xs font-medium text-neutral-700">
                    Packed {formatQuantity(row.packedQuantity)}
                  </div>
                  <div className="mt-3 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
                    Can make in this colour:{' '}
                    <span className="font-semibold text-neutral-950">
                      {capacity?.buildableQty === null || capacity?.buildableQty === undefined
                        ? 'BOM not set'
                        : formatQuantity(capacity.buildableQty)}
                    </span>
                    {capacity?.limitingComponentNames.length ? (
                      <div className="mt-1 truncate" title={capacity.limitingComponentNames.join(', ')}>
                        Limited by {capacity.limitingComponentNames.join(', ')}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
            The colour capacities use the colour-specific plastics in the supplied planning
            sheets. Finished-goods colour stock is intentionally not estimated from model-level
            sales; only recorded production remains colour-wise.
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-neutral-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
              Material readiness
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">
              What limits the next build
            </h2>
            <p className="mt-2 text-sm text-neutral-500">
              BOM {dashboard?.bomVersionNo ? `v${dashboard.bomVersionNo}` : 'not set'}
              {dashboard?.bomEffectiveFrom ? ` · effective ${formatDate(dashboard.bomEffectiveFrom)}` : ''}
            </p>
          </div>
          <a
            href={`/bom?fgSku=${encodeURIComponent(fgSku)}`}
            className="inline-flex justify-center rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900"
          >
            Manage BOM
          </a>
        </div>

        {dashboard?.componentReadiness.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[1280px] text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-[0.08em] text-neutral-500">
                <tr>
                  <th className="w-28 px-5 py-3 font-semibold">Photo</th>
                  <th className="min-w-72 px-4 py-3 font-semibold">Component</th>
                  <th className="px-4 py-3 text-right font-semibold">Per unit</th>
                  <th className="px-4 py-3 text-right font-semibold">Available</th>
                  <th className="px-4 py-3 text-right font-semibold">Can make</th>
                  <th className="px-4 py-3 text-right font-semibold">For open orders</th>
                  <th className="px-4 py-3 text-right font-semibold">Shortage</th>
                  <th className="min-w-36 px-5 py-3 text-right font-semibold">Last inward</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {dashboard.componentReadiness.map((component) => (
                  <tr key={component.componentItemId} className={`transition-colors hover:bg-amber-50/35 ${component.isLimiting ? 'bg-rose-50/60' : ''}`}>
                    <td className="px-5 py-3 pr-0">
                      <ComponentPhoto component={component} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-semibold text-neutral-950">{component.componentName}</div>
                          <div className="mt-1 text-xs text-neutral-500">{component.componentSku}</div>
                        </div>
                        {component.isLimiting ? (
                          <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-800">
                            Limiting
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right text-neutral-700">{formatQuantity(component.qtyPerFg, component.unit)}</td>
                    <td className="px-4 py-4 text-right font-medium text-neutral-950">{formatQuantity(component.availableQty, component.unit)}</td>
                    <td className="px-4 py-4 text-right font-semibold text-neutral-950">{formatQuantity(component.buildableQty)}</td>
                    <td className="px-4 py-4 text-right text-neutral-700">{formatQuantity(component.requiredForOpenOrdersQty, component.unit)}</td>
                    <td className={`px-4 py-4 text-right font-semibold ${component.shortageForOpenOrdersQty > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {formatQuantity(component.shortageForOpenOrdersQty, component.unit)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {component.lastInwardDate ? (
                        <div>
                          <div className="font-semibold text-neutral-900">{formatDate(component.lastInwardDate)}</div>
                          {component.lastInwardQty !== null ? (
                            <div className="mt-1 text-xs text-neutral-500">
                              +{formatQuantity(component.lastInwardQty, component.lastInwardUnit || component.unit)}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-neutral-400">Not recorded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-neutral-500">
            Add component lines to the FR-Cruzer BOM to calculate buildable quantity.
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 p-5 sm:p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Factory report</div>
            <h2 className="mt-2 text-xl font-semibold text-neutral-950">Recent production</h2>
          </div>
          {dashboard?.productionEntries.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Date / colour</th>
                    <th className="px-4 py-3 text-right font-semibold">Assembled</th>
                    <th className="px-4 py-3 text-right font-semibold">Packed</th>
                    <th className="px-4 py-3 font-semibold">Reference</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {dashboard.productionEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-5 py-4">
                        <div className="font-medium text-neutral-950">{formatDate(entry.production_date)}</div>
                        <div className="mt-1 text-xs text-neutral-500">{entry.color_variant}</div>
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-neutral-950">{formatQuantity(entry.quantity)}</td>
                      <td className="px-4 py-4 text-right font-semibold text-neutral-950">{formatQuantity(entry.packed_quantity)}</td>
                      <td className="px-4 py-4 text-neutral-600">{entry.report_reference || entry.notes || '—'}</td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          disabled={deletingEntryId === entry.id}
                          onClick={() => void removeEntry(entry)}
                          className="text-xs font-semibold text-rose-700 transition hover:text-rose-900 disabled:opacity-50"
                        >
                          {deletingEntryId === entry.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-neutral-500">No FR-Cruzer production recorded yet.</div>
          )}
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-neutral-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Sale report</div>
              <h2 className="mt-2 text-xl font-semibold text-neutral-950">Model-level dispatches</h2>
            </div>
            <button
              type="button"
              onClick={() => void syncSales()}
              disabled={isSyncing}
              className="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-50"
            >
              {isSyncing ? 'Syncing…' : 'Sync sales'}
            </button>
          </div>
          {dashboard?.salesRows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Sale date</th>
                    <th className="px-5 py-3 text-right font-semibold">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {dashboard.salesRows.map((row) => (
                    <tr key={row.saleDate}>
                      <td className="px-5 py-4 font-medium text-neutral-950">{formatDate(row.saleDate)}</td>
                      <td className="px-5 py-4 text-right font-semibold text-neutral-950">{formatQuantity(row.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-neutral-500">No FR-Cruzer sales have been synced yet.</div>
          )}
        </div>
      </section>

      <section className="rounded-[2rem] border border-violet-200 bg-violet-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Orders in hand</div>
            <h2 className="mt-2 text-2xl font-semibold text-violet-950">
              {formatQuantity(dashboard?.pendingOrderQty ?? 0)} FR-Cruzer pending
            </h2>
            <p className="mt-2 text-sm leading-6 text-violet-900/75">
              After reported finished goods, {formatQuantity(dashboard?.pendingAfterFinishedGoodsQty ?? 0)} units still need production.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {dashboard?.pendingOrderRows.length ? dashboard.pendingOrderRows.map((row, index) => (
              <div key={`${row.referenceDate}-${index}`} className="rounded-full border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-900">
                {formatDate(row.referenceDate)} · {formatQuantity(row.quantity)} pcs
              </div>
            )) : (
              <div className="rounded-full border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-900">
                No open order quantity
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
