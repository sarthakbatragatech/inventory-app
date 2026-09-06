'use client';

import { useEffect, useId, useState } from 'react';
import type { ProductionDashboard } from '@/lib/production';
import type { ProductionAlertPreview } from '@/lib/production-alerts';

type PreviewState =
  | { requestKey: string; status: 'ready'; preview: ProductionAlertPreview }
  | { requestKey: string; status: 'error'; message: string }
  | { requestKey: string; status: 'loading' };

const alertStyles = {
  critical: {
    label: 'Action needed',
    container: 'border-rose-200 bg-rose-50/60',
    badge: 'bg-rose-100 text-rose-800',
  },
  warning: {
    label: 'Review',
    container: 'border-amber-200 bg-amber-50/60',
    badge: 'bg-amber-100 text-amber-800',
  },
  info: {
    label: 'Information',
    container: 'border-neutral-200 bg-neutral-50',
    badge: 'bg-neutral-200 text-neutral-700',
  },
};

export function ProductionAlertsPanel({
  fgSku,
  dashboard,
}: {
  fgSku: string;
  dashboard: ProductionDashboard;
}) {
  const panelId = useId();
  const [attempt, setAttempt] = useState(0);
  const [previewState, setPreviewState] = useState<PreviewState>({
    requestKey: '',
    status: 'loading',
  });
  const requestKey = `${fgSku}:${dashboard.dataFreshness.calculatedAt}:${attempt}`;
  const currentState: PreviewState =
    previewState.requestKey === requestKey
      ? previewState
      : { requestKey, status: 'loading' };

  useEffect(() => {
    const controller = new AbortController();

    async function loadPreview() {
      try {
        const response = await fetch(
          `/api/production/alerts?fgSku=${encodeURIComponent(fgSku)}`,
          { cache: 'no-store', signal: controller.signal }
        );
        const payload = (await response.json()) as {
          alerts?: ProductionAlertPreview;
          error?: string;
        };

        if (!response.ok || !payload.alerts) {
          throw new Error(payload.error || 'Unable to load the WhatsApp preview.');
        }

        if (!controller.signal.aborted) {
          setPreviewState({ requestKey, status: 'ready', preview: payload.alerts });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setPreviewState({
            requestKey,
            status: 'error',
            message:
              error instanceof Error ? error.message : 'Unable to load the WhatsApp preview.',
          });
        }
      }
    }

    void loadPreview();
    return () => controller.abort();
  }, [fgSku, requestKey]);

  return (
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2">
      <section
        aria-labelledby={`${panelId}-inventory`}
        className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6"
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <h2 id={`${panelId}-inventory`} className="text-lg font-semibold text-neutral-950">
            Inventory alerts
          </h2>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
            {dashboard.alerts.length} current
          </span>
        </div>

        {dashboard.alerts.length === 0 ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            No active inventory alerts.
          </p>
        ) : (
          <ul className="space-y-3">
            {dashboard.alerts.map((alert) => {
              const style = alertStyles[alert.severity];
              return (
                <li
                  key={alert.code}
                  className={`min-w-0 rounded-xl border p-4 ${style.container}`}
                >
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.badge}`}
                  >
                    {style.label}
                  </span>
                  <h3 className="mt-2 break-words text-sm font-semibold text-neutral-950">
                    {alert.title}
                  </h3>
                  <p className="mt-1 break-words text-sm leading-6 text-neutral-700">
                    {alert.message}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        aria-labelledby={`${panelId}-whatsapp`}
        className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-6"
      >
        <h2 id={`${panelId}-whatsapp`} className="text-lg font-semibold text-neutral-950">
          WhatsApp alerts
        </h2>
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          Preview only · not sending
        </p>

        {currentState.status === 'loading' ? (
          <div role="status" className="mt-5 space-y-3">
            <p className="text-sm text-neutral-500">Preparing alert preview…</p>
            <div aria-hidden="true" className="h-52 rounded-xl bg-neutral-100 motion-safe:animate-pulse" />
          </div>
        ) : currentState.status === 'error' ? (
          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p role="alert" className="break-words text-sm text-rose-800">
              {currentState.message}
            </p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mt-3 min-h-11 rounded-lg border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-800 transition hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
            >
              Retry preview
            </button>
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 sm:p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-800">
                Message draft
              </p>
              <p className="whitespace-pre-wrap break-words rounded-lg bg-white p-4 text-sm leading-6 text-neutral-800 shadow-sm">
                {currentState.preview.messagePreview}
              </p>
            </div>

            <details className="mt-5 border-t border-neutral-200 pt-2">
              <summary className="min-h-11 cursor-pointer rounded-lg py-3 text-sm font-semibold text-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-700">
                Connection &amp; setup
              </summary>
              <div className="space-y-4 pb-1 pt-2">
                <p className="text-sm text-neutral-600">
                  {currentState.preview.configured
                    ? 'WhatsApp configuration is present. Delivery has not been verified.'
                    : 'WhatsApp configuration is incomplete in this environment.'}
                </p>
                <ul className="space-y-2">
                  {currentState.preview.checks.map((check) => (
                    <li key={check.id} className="flex items-start justify-between gap-4 text-sm">
                      <span className="min-w-0 text-neutral-600">{check.label}</span>
                      <span
                        className={`shrink-0 font-medium ${check.ready ? 'text-emerald-700' : 'text-amber-700'}`}
                      >
                        {check.ready ? 'Present' : 'Missing'}
                      </span>
                    </li>
                  ))}
                </ul>
                {currentState.preview.existingSchedule ? (
                  <p className="text-sm text-neutral-500">{currentState.preview.existingSchedule}.</p>
                ) : null}
                <div>
                  <h3 className="text-sm font-semibold text-neutral-800">To enable alerts</h3>
                  <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-neutral-600">
                    {currentState.preview.requirements.map((requirement) => (
                      <li key={requirement} className="pl-1">{requirement}</li>
                    ))}
                  </ol>
                </div>
              </div>
            </details>
          </>
        )}
      </section>
    </div>
  );
}
