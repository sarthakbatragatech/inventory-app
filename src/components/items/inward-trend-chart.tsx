'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import embed, { type Result, type VisualizationSpec } from 'vega-embed';

type ChartPoint = {
  inwardDate: string;
  totalQuantity: number;
  unit: string | null;
  entryCount: number;
};

export function InwardTrendChart() {
  const params = useParams<{ id?: string | string[] }>();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const resolvedItemId =
    typeof params.id === 'string'
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : null;

  useEffect(() => {
    let cancelled = false;

    async function loadPoints() {
      if (!resolvedItemId) {
        setError('Chart data is unavailable for this item.');
        setPoints([]);
        return;
      }

      try {
        setError(null);
        const response = await fetch(
          `/api/items/${encodeURIComponent(resolvedItemId)}/chart`,
          {
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          const details = await response.text();
          throw new Error(
            `Failed to load chart data: ${response.status}${
              details ? ` - ${details}` : ''
            }`
          );
        }

        const data = (await response.json()) as { points?: ChartPoint[] };
        if (!cancelled) {
          setPoints(Array.isArray(data.points) ? data.points : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          console.error(loadError);
          setError('Unable to load chart data.');
          setPoints([]);
        }
      }
    }

    void loadPoints();

    return () => {
      cancelled = true;
    };
  }, [resolvedItemId]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || !points.length) {
      return;
    }

    const values = points.map((point) => ({
      inwardDate: point.inwardDate,
      totalQuantity: Number(point.totalQuantity.toFixed(2)),
      unit: point.unit || '',
      entryCount: point.entryCount,
    }));

    const spec: VisualizationSpec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      width: 'container',
      height: 256,
      autosize: {
        type: 'fit-x',
        contains: 'padding',
      },
      background: 'white',
      data: {
        values,
      },
      mark: {
        type: 'bar',
        color: '#0284c7',
        cornerRadiusTopLeft: 6,
        cornerRadiusTopRight: 6,
      },
      encoding: {
        x: {
          field: 'inwardDate',
          type: 'temporal',
          title: null,
          timeUnit: 'yearmonthdate',
          axis: {
            format: '%d %b %Y',
            labelAngle: -20,
            labelColor: '#525252',
            titleColor: '#525252',
            grid: false,
          },
        },
        y: {
          field: 'totalQuantity',
          type: 'quantitative',
          title: 'Quantity',
          axis: {
            labelColor: '#525252',
            titleColor: '#525252',
            gridColor: '#e5e5e5',
            tickColor: '#d4d4d4',
          },
        },
        tooltip: [
          {
            field: 'inwardDate',
            type: 'temporal',
            title: 'Date',
            format: '%d %b %Y',
          },
          {
            field: 'totalQuantity',
            type: 'quantitative',
            title: 'Quantity',
            format: '.2f',
          },
          {
            field: 'unit',
            type: 'nominal',
            title: 'Unit',
          },
          {
            field: 'entryCount',
            type: 'quantitative',
            title: 'Entries',
          },
        ],
      },
      config: {
        view: {
          stroke: '#e5e5e5',
          cornerRadius: 16,
        },
        bar: {
          discreteBandSize: 24,
        },
        axis: {
          domainColor: '#d4d4d4',
        },
      },
    };

    let chart: Result | null = null;
    let cancelled = false;

    void embed(container, spec, {
      actions: false,
      renderer: 'svg',
      mode: 'vega-lite',
    })
      .then((result) => {
        if (cancelled) {
          result.finalize();
          return;
        }

        chart = result;
      })
      .catch((error: unknown) => {
        console.error('[vega-embed] Error creating view:', error);
      });

    return () => {
      cancelled = true;
      chart?.finalize();
      container.innerHTML = '';
    };
  }, [points]);

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (!points.length) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-12 text-center text-sm text-neutral-500">
        Loading chart…
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef} className="w-full" />
      <p className="mt-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">
        Quantity Over Time
      </p>
    </div>
  );
}
