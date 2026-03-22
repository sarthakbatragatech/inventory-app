'use client';

import { useEffect, useState, useTransition } from 'react';

type CatalogOption = {
  fg_sku: string;
  fg_name: string | null;
  source_item_id: string | null;
};

type ComponentItemOption = {
  id: string;
  sku: string;
  item_name: string;
  default_unit: string | null;
  category: string | null;
};

type BomLine = {
  id: string;
  bom_version_id: string;
  component_item_id: string;
  component_sku: string;
  component_name: string;
  qty_per_fg: number;
  unit: string | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
};

type BomVersion = {
  id: string;
  bom_model_id: string;
  version_no: number;
  effective_from: string;
  notes: string | null;
  created_at: string;
  lines: BomLine[];
};

type BomDetail = {
  model: {
    id: string;
    fg_sku: string;
    fg_name: string | null;
    source_item_id: string | null;
    created_at: string;
    updated_at: string;
  };
  versions: BomVersion[];
};

type EditableLine = {
  componentSearch: string;
  componentItemId: string;
  componentSku: string;
  componentName: string;
  qtyPerFg: string;
  unit: string;
  notes: string;
};

type Props = {
  catalogOptions: CatalogOption[];
  componentOptions: ComponentItemOption[];
  initialFgSku: string;
};

const DEFAULT_BOM_EFFECTIVE_FROM = '2025-11-01';

function buildEmptyLine(): EditableLine {
  return {
    componentSearch: '',
    componentItemId: '',
    componentSku: '',
    componentName: '',
    qtyPerFg: '',
    unit: '',
    notes: '',
  };
}

function buildEditableLine(line: BomLine): EditableLine {
  return {
    componentSearch: line.component_sku || line.component_name,
    componentItemId: line.component_item_id,
    componentSku: line.component_sku,
    componentName: line.component_name,
    qtyPerFg: String(line.qty_per_fg),
    unit: line.unit ?? '',
    notes: line.notes ?? '',
  };
}

function getFilteredComponentOptions(
  componentOptions: ComponentItemOption[],
  line: EditableLine
) {
  const query = (line.componentSearch ?? '').trim().toLowerCase();
  const options = query
    ? componentOptions.filter((option) => {
        const haystack = `${option.sku} ${option.item_name} ${option.category ?? ''}`.toLowerCase();
        return haystack.includes(query);
      })
    : componentOptions;

  return options.slice(0, 15);
}

function formatCatalogLabel(option: CatalogOption) {
  return option.fg_name ? `${option.fg_sku} - ${option.fg_name}` : option.fg_sku;
}

export function BomManager({
  catalogOptions,
  componentOptions,
  initialFgSku,
}: Props) {
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedFgSku, setSelectedFgSku] = useState(initialFgSku);
  const [detail, setDetail] = useState<BomDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(DEFAULT_BOM_EFFECTIVE_FROM);
  const [versionNotes, setVersionNotes] = useState('');
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedCatalog =
    catalogOptions.find((option) => option.fg_sku === selectedFgSku) ?? null;
  const selectedVersion =
    detail?.versions.find((version) => version.id === selectedVersionId) ?? null;
  const normalizedCatalogSearch = catalogSearch.trim().toLowerCase();
  const filteredCatalogOptions = normalizedCatalogSearch
    ? catalogOptions.filter((option) => {
        const haystack = `${option.fg_sku} ${option.fg_name ?? ''}`.toLowerCase();
        return haystack.includes(normalizedCatalogSearch);
      })
    : catalogOptions;

  function resetEditorState() {
    setDetail(null);
    setSelectedVersionId('');
    setLines([]);
    setVersionNotes('');
    setEffectiveFrom(DEFAULT_BOM_EFFECTIVE_FROM);
    setError(null);
    setStatus(null);
  }

  function selectVersion(nextDetail: BomDetail | null, versionId: string) {
    setSelectedVersionId(versionId);

    const nextVersion =
      nextDetail?.versions.find((version) => version.id === versionId) ?? null;
    setVersionNotes(nextVersion?.notes ?? '');
    setEffectiveFrom(nextVersion?.effective_from ?? DEFAULT_BOM_EFFECTIVE_FROM);
    setLines(nextVersion ? nextVersion.lines.map(buildEditableLine) : []);
  }

  useEffect(() => {
    if (!selectedFgSku) {
      return;
    }

    let cancelled = false;

    startTransition(() => {
      void fetch(`/api/bom?fgSku=${encodeURIComponent(selectedFgSku)}`)
        .then(async (response) => {
          const payload = (await response.json()) as { detail?: BomDetail; error?: string };
          if (!response.ok) {
            throw new Error(payload.error || 'Failed to load BOM.');
          }

          if (cancelled) {
            return;
          }

          const nextDetail = payload.detail ?? null;
          setDetail(nextDetail);

          const latestVersion = nextDetail?.versions[0] ?? null;
          selectVersion(nextDetail, latestVersion?.id ?? '');
          setError(null);
          setStatus(null);
        })
        .catch((loadError: unknown) => {
          if (cancelled) {
            return;
          }

          setDetail(null);
          setSelectedVersionId('');
          setLines([]);
          setError(loadError instanceof Error ? loadError.message : 'Failed to load BOM.');
        });
    });

    return () => {
      cancelled = true;
    };
  }, [selectedFgSku]);

  function syncDetail(nextDetail: BomDetail | null, preferredVersionId?: string) {
    setDetail(nextDetail);

    const fallbackVersionId = nextDetail?.versions[0]?.id ?? '';
    const nextVersionId =
      preferredVersionId &&
      nextDetail?.versions.some((version) => version.id === preferredVersionId)
        ? preferredVersionId
        : fallbackVersionId;

    selectVersion(nextDetail, nextVersionId);
  }

  async function createVersion() {
    if (!selectedFgSku) {
      setError('Choose a finished-good SKU first.');
      return;
    }

    const payload = {
      fgSku: selectedFgSku,
      fgName: selectedCatalog?.fg_name ?? detail?.model.fg_name ?? null,
      sourceItemId: selectedCatalog?.source_item_id ?? detail?.model.source_item_id ?? null,
      effectiveFrom,
      notes: versionNotes,
    };

    startTransition(() => {
      void fetch('/api/bom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
        .then(async (response) => {
          const result = (await response.json()) as {
            ok?: boolean;
            versionId?: string;
            detail?: BomDetail | null;
            error?: string;
          };

          if (!response.ok) {
            throw new Error(result.error || 'Failed to create BOM version.');
          }

          syncDetail(result.detail ?? null, result.versionId);
          setStatus(`Created BOM version for ${selectedFgSku}.`);
          setError(null);
        })
        .catch((createError: unknown) => {
          setError(
            createError instanceof Error ? createError.message : 'Failed to create BOM version.'
          );
          setStatus(null);
        });
    });
  }

  async function saveVersion() {
    if (!selectedVersionId) {
      setError('Create or select a BOM version before saving lines.');
      return;
    }

    startTransition(() => {
      void fetch(`/api/bom/${selectedVersionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          effectiveFrom,
          notes: versionNotes,
          lines: lines.map((line) => ({
            componentItemId: line.componentItemId,
            componentSku: line.componentSku,
            componentName: line.componentName,
            qtyPerFg: Number(line.qtyPerFg),
            unit: line.unit || null,
            notes: line.notes || null,
          })),
        }),
      })
        .then(async (response) => {
          const result = (await response.json()) as {
            ok?: boolean;
            detail?: BomDetail | null;
            error?: string;
          };

          if (!response.ok) {
            throw new Error(result.error || 'Failed to save BOM lines.');
          }

          syncDetail(result.detail ?? null, selectedVersionId);
          setStatus(`Saved version ${selectedVersion?.version_no ?? ''}.`);
          setError(null);
        })
        .catch((saveError: unknown) => {
          setError(saveError instanceof Error ? saveError.message : 'Failed to save BOM lines.');
          setStatus(null);
        });
    });
  }

  function updateLine(index: number, field: keyof EditableLine, value: string) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [field]: value,
            }
          : line
      )
    );
  }

  function applyComponent(index: number, componentId: string) {
    const component = componentOptions.find((option) => option.id === componentId);

    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              componentSearch: component?.sku
                ? `${component.sku} - ${component.item_name}`
                : line.componentSearch,
              componentItemId: componentId,
              componentSku: component?.sku ?? '',
              componentName: component?.item_name ?? '',
              unit: component?.default_unit ?? line.unit,
            }
          : line
      )
    );
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Model BOMs</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Start from a finished-good SKU from synced sales, then create versioned BOM
          definitions for that model.
        </p>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Search finished-good SKU
            </span>
            <input
              type="text"
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder="Search by FG SKU or model name"
              className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-950"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Finished-good SKU
            </span>
            <select
              value={selectedFgSku}
              onChange={(event) => {
                const nextSku = event.target.value;
                if (!nextSku) {
                  resetEditorState();
                }
                setSelectedFgSku(nextSku);
              }}
              className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-950"
            >
              <option value="">Select a model SKU</option>
              {filteredCatalogOptions.map((option) => (
                <option key={option.fg_sku} value={option.fg_sku}>
                  {formatCatalogLabel(option)}
                </option>
              ))}
            </select>
            <div className="mt-2 text-xs text-neutral-500">
              Showing {filteredCatalogOptions.length} of {catalogOptions.length} sales SKUs.
            </div>
          </label>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Current model
            </div>
            <div className="mt-2 text-base font-medium text-neutral-950">
              {selectedCatalog?.fg_name || detail?.model.fg_name || 'No BOM yet'}
            </div>
            <div className="mt-1 text-sm text-neutral-600">
              {selectedFgSku || 'Choose a finished-good SKU to begin.'}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Effective from
            </span>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-950"
            />
            <div className="mt-2 text-xs text-neutral-500">
              Defaulted to 2025-11-01 for historical BOM backfill.
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Version notes
            </span>
            <textarea
              value={versionNotes}
              onChange={(event) => setVersionNotes(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-950"
              placeholder="Why this BOM version exists"
            />
          </label>

          <button
            type="button"
            onClick={() => void createVersion()}
            disabled={isPending || !selectedFgSku}
            className="w-full rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            Create new BOM version
          </button>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Existing versions
            </div>
            {detail?.versions.length ? (
              detail.versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => selectVersion(detail, version.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    version.id === selectedVersionId
                      ? 'border-neutral-950 bg-neutral-950 text-white'
                      : 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 hover:bg-neutral-50'
                  }`}
                >
                  <div className="text-sm font-medium">
                    v{version.version_no} · {version.effective_from}
                  </div>
                  <div
                    className={`mt-1 text-xs ${
                      version.id === selectedVersionId ? 'text-neutral-200' : 'text-neutral-500'
                    }`}
                  >
                    {version.lines.length} component{version.lines.length === 1 ? '' : 's'}
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-neutral-300 px-4 py-5 text-sm text-neutral-500">
                No BOM version exists for this model yet.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-neutral-200 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Component lines</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Each row defines how much of a component SKU is consumed when one unit of
              the selected model is made.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setLines((current) => [...current, buildEmptyLine()])}
              disabled={!selectedVersionId || isPending}
              className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 transition hover:border-neutral-400 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400"
            >
              Add component line
            </button>
            <button
              type="button"
              onClick={() => void saveVersion()}
              disabled={!selectedVersionId || isPending}
              className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-200"
            >
              Save BOM lines
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {status ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {status}
          </div>
        ) : null}

        {!selectedVersionId ? (
          <div className="mt-6 rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-sm text-neutral-500">
            Select a model and create a BOM version before editing component lines.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-[0.14em] text-neutral-500">
                <tr>
                  <th className="px-3 py-3">Component SKU</th>
                  <th className="px-3 py-3">Item</th>
                  <th className="px-3 py-3">Qty / FG</th>
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3">Notes</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {lines.length ? (
                  lines.map((line, index) => (
                    <tr key={`${selectedVersionId}-${index}`} className="border-b border-neutral-100 align-top">
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={line.componentSearch}
                          onChange={(event) =>
                            updateLine(index, 'componentSearch', event.target.value)
                          }
                          placeholder="Search component SKU or name"
                          className="w-64 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                        />
                        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50">
                          {getFilteredComponentOptions(componentOptions, line).map((component) => (
                            <button
                              key={component.id}
                              type="button"
                              onClick={() => applyComponent(index, component.id)}
                              className={`block w-full px-3 py-2 text-left text-xs transition ${
                                component.id === line.componentItemId
                                  ? 'bg-sky-100 text-sky-950'
                                  : 'text-neutral-700 hover:bg-white'
                              }`}
                            >
                              <span className="font-medium">{component.sku}</span>
                              <span className="text-neutral-500"> {' '}· {component.item_name}</span>
                            </button>
                          ))}
                          {getFilteredComponentOptions(componentOptions, line).length === 0 ? (
                            <div className="px-3 py-2 text-xs text-neutral-500">
                              No component matches.
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 text-xs text-neutral-500">{line.componentSku || '—'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-neutral-900">
                          {line.componentName || 'Select a component SKU'}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={line.qtyPerFg}
                          onChange={(event) => updateLine(index, 'qtyPerFg', event.target.value)}
                          className="w-28 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={line.unit}
                          onChange={(event) => updateLine(index, 'unit', event.target.value)}
                          className="w-24 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={line.notes}
                          onChange={(event) => updateLine(index, 'notes', event.target.value)}
                          className="w-56 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => removeLine(index)}
                          className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-sm text-neutral-500">
                      No component lines yet. Add the first BOM row for this version.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
