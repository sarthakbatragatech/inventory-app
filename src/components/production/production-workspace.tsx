'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProductionDashboard, ProductionEntry } from '@/lib/production';
import { ProductionEntryDialog } from './production-entry-dialog';
import { ProductionMaterials } from './production-materials';
import { ProductionAlertsPanel } from './production-alerts-panel';
import { ColorSwatch, csvDownload, dateLabel, quantity } from './production-ui';
import s from './production.module.css';

type View = 'overview' | 'materials' | 'activity' | 'alerts';

function Overview({ dashboard: d, onMaterials, onAlerts, onActivity }: { dashboard: ProductionDashboard; onMaterials: (status: string) => void; onAlerts: () => void; onActivity: () => void }) {
  const plan = d.demandPlanning;
  const shortages = d.componentReadiness.filter(row => !row.hasUnitConflict && row.shortageForOpenOrdersQty > 0);
  const topAlert = d.alerts.find(alert => alert.severity === 'critical') ?? d.alerts.find(alert => alert.severity === 'warning');
  const produced = new Map(d.colorSummary.map(row => [row.color, row]));
  const unmappedColors = d.colorSummary.filter(row => !d.colorCapacity.some(capacity => capacity.color === row.color) && (row.quantity || row.packedQuantity));
  const orderSlices = [
    { label: 'Ready to dispatch', value: plan.readyToDispatchQty, color: '#4b7164' },
    { label: 'In assembly / WIP', value: Math.min(plan.wipAvailableQty, plan.packingRequiredQty), color: '#d7b267' },
    { label: 'New assemblies needed', value: plan.newAssemblyRequiredQty, color: '#e4e6e3' },
  ];
  return <div className={s.overview}>
    {topAlert && <div className={s.alertStrip}><span className={s.alertIcon} aria-hidden="true">!</span><div><strong>{topAlert.title}</strong><p>{topAlert.message}</p></div><button className={s.textButton} onClick={onAlerts}>Review alerts <span aria-hidden="true">↗</span></button></div>}
    <div className={s.overviewGrid}>
      <section className={s.panel} aria-labelledby="demand-heading">
        <div className={s.panelHeading}><div><span className={s.eyebrow}>ORDER COVERAGE</span><h2 id="demand-heading">What needs to happen next</h2></div><span className={s.badge}>{quantity(Math.round(plan.orderCoveragePct))}% ready</span></div>
        <div className={s.orderPlan}>
          <div className={s.coverageBar} role="img" aria-label={`${quantity(plan.readyToDispatchQty)} ready, ${quantity(Math.min(plan.wipAvailableQty, plan.packingRequiredQty))} in WIP, ${quantity(plan.newAssemblyRequiredQty)} new assemblies needed out of ${quantity(d.pendingOrderQty)} open orders`}>
            {orderSlices.map(slice => <span key={slice.label} style={{ width: `${d.pendingOrderQty > 0 ? slice.value / d.pendingOrderQty * 100 : 0}%`, background: slice.color }} />)}
          </div>
          <dl className={s.planRows}>{orderSlices.map((slice, index) => <div key={slice.label}><dt><span className={s.step}>{index + 1}</span><span><strong>{slice.label}</strong>{index === 1 && <small>{quantity(plan.recommendedPackQty)} can be packed with current parts</small>}</span></dt><dd>{quantity(slice.value)}</dd></div>)}</dl>
          <div className={s.planTotal}><span>Open orders</span><strong>{quantity(d.pendingOrderQty)} bikes</strong></div>
        </div>
      </section>
      <section className={s.panel} aria-labelledby="priority-heading">
        <div className={s.panelHeading}><div><span className={s.eyebrow}>PURCHASE PRIORITIES</span><h2 id="priority-heading">Shared parts to replenish</h2></div><span className={s.count}>{shortages.length}</span></div>
        <div className={s.priorityList}>{shortages.length ? shortages.slice(0, 4).map(row => <button key={row.componentItemId} onClick={() => onMaterials('purchase')} className={s.priorityRow}><span><strong>{row.componentName.replace(/^FR[ -]?001\s*/i, '')}</strong><small>{quantity(row.availableQty, row.unit)} in stock · {row.consumptionStage === 'packed' ? 'Packing' : 'Assembly'}</small></span><span className={s.priorityQty}>{quantity(row.shortageForOpenOrdersQty)}<small>{row.unit || 'pcs'} to order</small></span></button>) : <div className={s.empty}>Shared parts cover net order demand.</div>}</div>
        <div className={s.panelFooter}><button className={s.textButton} onClick={() => onMaterials('all')}>View all materials <span aria-hidden="true">→</span></button><span>After finished stock &amp; WIP</span></div>
      </section>
    </div>
    <section className={s.panel} aria-labelledby="colour-heading">
      <div className={s.panelHeading}><div><span className={s.eyebrow}>PRODUCTION MIX</span><h2 id="colour-heading">Four colours. One shared inventory.</h2></div><span className={s.muted}>Bikes</span></div>
      <div className={s.colorGrid}>{d.colorCapacity.map(row => {
        const output = produced.get(row.color);
        return <article className={s.colorCard} key={row.color}><h3><ColorSwatch color={row.color} />{row.color}</h3><dl><div><dt>Assembled</dt><dd>{quantity(output?.quantity ?? 0)}</dd></div><div><dt>Packed</dt><dd>{quantity(output?.packedQuantity ?? 0)}</dd></div><div><dt>Can make</dt><dd className={row.buildableQty === 0 ? s.danger : ''}>{quantity(row.buildableQty)}</dd></div></dl><details><summary>Capacity details</summary><p>Colour parts alone: {quantity(row.variantBuildableQty)} bikes. Shared parts: {quantity(d.sharedBuildableQty)} bikes.</p>{row.limitingComponentNames.length > 0 && <p>Limited by {row.limitingComponentNames.join(', ')}.</p>}</details></article>;
      })}</div>
      {unmappedColors.length > 0 && <div className={s.unallocated}>{unmappedColors.map(row => <span key={row.color}><strong>{row.color}:</strong> {quantity(row.quantity)} assembled · {quantity(row.packedQuantity)} packed</span>)}<button className={s.textButton} onClick={onActivity}>Review records →</button></div>}
      <div className={s.caption}>Colour capacities share parts and cannot be added. Sales and order quantities remain model-level.</div>
    </section>
    <div className={s.runTotals}><span>RECORDED OUTPUT</span><div><strong>{quantity(d.productionTotalQty)}</strong> assembled</div><div><strong>{quantity(d.packedTotalQty)}</strong> packed</div><div><strong>{quantity(d.salesTotalQty)}</strong> sold</div><a className={s.textButton} href={`/bom?fgSku=${encodeURIComponent(d.fgSku)}`}>BOM v{d.bomVersionNo ?? '—'} <span aria-hidden="true">↗</span></a></div>
  </div>;
}

function Activity({ dashboard, colors, onDelete, busy, onSync }: { dashboard: ProductionDashboard; colors: string[]; onDelete: (row: ProductionEntry) => void; busy: boolean; onSync: () => void }) {
  const [kind, setKind] = useState<'production' | 'sales' | 'orders'>('production');
  const [color, setColor] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const all = useMemo(() => {
    if (kind === 'production') return dashboard.productionEntries.filter(row => color === 'all' || row.color_variant === color).map(row => ({ id: row.id, date: row.production_date, color: row.color_variant, assembled: row.quantity, packed: row.packed_quantity, reference: row.report_reference, notes: row.notes, entry: row }));
    if (kind === 'sales') return dashboard.salesRows.map((row, index) => ({ id: `sale-${index}`, date: row.saleDate, color: 'Model total', assembled: row.quantity, packed: null, reference: null, notes: null, entry: null }));
    return dashboard.pendingOrderRows.map((row, index) => ({ id: `order-${index}`, date: row.referenceDate, color: 'Model total', assembled: row.quantity, packed: null, reference: null, notes: null, entry: null }));
  }, [dashboard, color, kind]);
  const rows = all.filter(row => (!from || row.date >= from) && (!to || row.date <= to)).sort((a, b) => b.date.localeCompare(a.date));
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const current = Math.min(page, pages - 1);
  const shown = rows.slice(current * 10, (current + 1) * 10);
  const countLabel = kind === 'production' ? 'Assembled' : kind === 'sales' ? 'Sold' : 'Open quantity';
  function exportRows() { csvDownload(`FR-CRUZER-${kind}.csv`, [['Date', 'Colour', countLabel, 'Packed', 'Reference', 'Notes'], ...rows.map(row => [row.date, row.color, row.assembled, row.packed, row.reference, row.notes])]); }
  return <section className={s.panel}>
    <div className={s.panelHeading}><h2>Activity &amp; reports</h2><div className={s.actions}><button className={s.button} onClick={onSync} disabled={busy}>{busy ? 'Working…' : 'Sync Tycoon sales'}</button><button className={s.button} onClick={exportRows} disabled={!rows.length}>Export CSV ↓</button></div></div>
    <div className={s.filters}>
      <label><span>Report</span><select value={kind} onChange={e => { setKind(e.target.value as typeof kind); setPage(0); }}><option value="production">Production</option><option value="sales">Sales</option><option value="orders">Open orders</option></select></label>
      {kind === 'production' && <label><span>Colour</span><select value={color} onChange={e => { setColor(e.target.value); setPage(0); }}><option value="all">All colours</option>{colors.map(c => <option key={c}>{c}</option>)}</select></label>}
      <label><span>From</span><input type="date" value={from} onChange={e => { setFrom(e.target.value); if (to && e.target.value > to) setTo(''); setPage(0); }} /></label><label><span>To</span><input type="date" min={from || undefined} value={to} onChange={e => { setTo(e.target.value); if (e.target.value && e.target.value < from) setFrom(''); setPage(0); }} /></label>
      {(from || to || color !== 'all') && <button className={s.textButton} onClick={() => { setFrom(''); setTo(''); setColor('all'); setPage(0); }}>Clear</button>}
    </div>
    <div className={s.tableNote}><span>{rows.length} records · {quantity(rows.reduce((sum, row) => sum + row.assembled, 0))} {countLabel.toLowerCase()}{kind === 'production' && <> · {quantity(rows.reduce((sum, row) => sum + (row.packed ?? 0), 0))} packed</>}</span></div>
    {shown.length ? <div className={s.activityList}>{shown.map(row => <article className={s.activityRow} key={row.id}><div><strong>{dateLabel(row.date)}</strong><small>{row.color}</small>{(row.reference || row.notes) && <details><summary>Report details</summary><p>{row.reference}{row.reference && row.notes ? ' · ' : ''}{row.notes}</p></details>}</div><dl><div><dt>{countLabel}</dt><dd>{quantity(row.assembled)}</dd></div>{row.packed != null && <div><dt>Packed</dt><dd>{quantity(row.packed)}</dd></div>}</dl>{row.entry && <button className={s.deleteButton} disabled={busy} onClick={() => onDelete(row.entry!)} aria-label={`Delete production ${row.color} on ${dateLabel(row.date)}, ${row.assembled} assembled and ${row.packed} packed`}>Delete</button>}</article>)}</div> : <div className={s.empty}>No records in this selection.</div>}
    <div className={s.pagination}><span aria-live="polite">Page {current + 1} of {pages}</span><div className={s.actions}><button className={s.button} disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><button className={s.button} disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next</button></div></div>
  </section>;
}

export function ProductionWorkspace({ fgSku, colors, focusView = false }: { fgSku: string; colors: string[]; focusView?: boolean }) {
  const [dashboard, setDashboard] = useState<ProductionDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [view, setView] = useState<View>('overview');
  const [materialStatus, setMaterialStatus] = useState('all');
  const operation = useRef(false);
  const request = useRef<AbortController | null>(null);
  const sectionNav = useRef<HTMLElement | null>(null);
  const focusSectionNav = useRef(false);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const response = await fetch(`/api/production?fgSku=${encodeURIComponent(fgSku)}`, { cache: 'no-store', signal: controller.signal });
      const payload = await response.json() as { dashboard?: ProductionDashboard; error?: string };
      if (!response.ok || !payload.dashboard) throw new Error(payload.error || 'Unable to load inventory. Please retry.');
      if (!controller.signal.aborted) { setDashboard(payload.dashboard); setError(''); }
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Unable to load inventory. Please retry.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [fgSku]);
  useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);
  useEffect(() => {
    if (focusSectionNav.current) {
      sectionNav.current?.querySelector<HTMLButtonElement>('[aria-current]')?.focus();
      focusSectionNav.current = false;
    }
  }, [view]);

  async function mutate(url: string, method: string, success: string) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true); setActionError(''); setMessage('');
    try {
      const response = await fetch(url, { method });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'The action could not be completed.');
      setMessage(success);
      await load();
    } catch (caught) { setActionError(caught instanceof Error ? caught.message : 'The action could not be completed.'); }
    finally { setBusy(false); operation.current = false; }
  }
  function removeEntry(row: ProductionEntry) {
    if (window.confirm(`Delete ${row.quantity} assembled and ${row.packed_quantity} packed ${row.color_variant} bikes on ${dateLabel(row.production_date)}? This reverses their material consumption.`)) void mutate(`/api/production/${encodeURIComponent(row.id)}`, 'DELETE', 'Production entry deleted.');
  }
  function navigateTo(next: View) { focusSectionNav.current = true; setView(next); }
  function openMaterials(status: string) { setMaterialStatus(status); navigateTo('materials'); }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setMessage('Use your browser’s full-screen command. This view already hides the app navigation.');
    } catch { setMessage('Use your browser’s full-screen command to expand this view.'); }
  }
  const alerts = dashboard?.alerts.filter(alert => alert.severity !== 'info').length ?? 0;
  return <div className={`${s.workspace} ${focusView ? 'cruzer-focus' : ''}`}>
    <div className={s.container}>
      <header className={s.heading}><div><div className={s.productLabel}><span className={s.productMark} aria-hidden="true">C</span><span>FACTORY CONTROL <span className={s.divider}>/</span> {fgSku}</span></div><h1>Cruzer <span>production desk</span></h1></div><div className={s.actions}>
        {focusView ? <><a className={s.button} href={`/production?fgSku=${encodeURIComponent(fgSku)}`}>Exit focus</a><button className={s.button} onClick={fullscreen}>Full screen <span aria-hidden="true">⛶</span></button></> : <a className={s.button} href={`/production?fgSku=${encodeURIComponent(fgSku)}&view=focus`} target="_blank" rel="noopener noreferrer">Open focus view <span aria-hidden="true">↗</span></a>}
        <button className={s.iconButton} title="Refresh inventory" aria-label="Refresh inventory" disabled={loading || busy} onClick={() => void load()}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 6a8 8 0 0 1 13 3M18 18A8 8 0 0 1 5 15" /></svg></button>
        <ProductionEntryDialog fgSku={fgSku} colors={colors} onSaved={() => { setMessage('Production saved.'); void load(); }} />
      </div></header>
      {error && <div role="alert" className={s.error}><strong>{dashboard ? 'Refresh failed. Showing the last loaded snapshot.' : 'Inventory is unavailable.'}</strong><p>{error}</p><button className={s.button} onClick={() => void load()} disabled={loading}>Retry</button></div>}
      {actionError && <div role="alert" className={s.error}><strong>Action failed</strong><p>{actionError}</p><button className={s.button} onClick={() => setActionError('')}>Dismiss</button></div>}
      {message && <div role="status" className={s.status}>{message}<button aria-label="Dismiss status" onClick={() => setMessage('')}>×</button></div>}
      {!dashboard ? (loading ? <div className={s.loading} role="status"><span className={s.loader} /><h2>Loading the production desk</h2><p>Stock, production and open orders</p></div> : null) : <>
        <div className={s.freshness}><span>{loading ? 'Refreshing…' : 'Snapshot'} <time dateTime={dashboard.dataFreshness.calculatedAt}>{new Date(dashboard.dataFreshness.calculatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></span><span>Production <strong>{dateLabel(dashboard.dataFreshness.latestProductionDate)}</strong></span><span>Sales <strong>{dateLabel(dashboard.dataFreshness.latestSalesDate)}</strong></span><span>Inward <strong>{dateLabel(dashboard.dataFreshness.latestInwardDate)}</strong></span></div>
        {!dashboard.bomVersionId && <div className={s.error}>An effective BOM is needed to calculate capacity. <a href={`/bom?fgSku=${encodeURIComponent(fgSku)}`}>Set up BOM →</a></div>}
        <section className={s.metrics} aria-label="Production summary">
          <article className={s.capacityMetric}><span>Can make now</span><strong>{quantity(dashboard.buildableQty)}</strong><div>{dashboard.buildableQty === 0 ? <span className={s.badgeDark}>Production constrained</span> : <span>Complete bikes · all parts</span>}<button onClick={() => openMaterials('zero')} aria-label="View capacity constraints">↗</button></div></article>
          <article><span>Finished stock</span><strong className={dashboard.reportedFinishedGoodsQty < 0 ? s.danger : ''}>{quantity(dashboard.reportedFinishedGoodsQty)}</strong><div>Packed − sold</div></article>
          <article><span>Work in progress</span><strong className={dashboard.workInProgressQty < 0 ? s.danger : ''}>{quantity(dashboard.workInProgressQty)}</strong><div>Assembled, not packed</div></article>
          <article><span>Open orders</span><strong>{quantity(dashboard.pendingOrderQty)}</strong><div><span>{quantity(dashboard.demandPlanning.newAssemblyRequiredQty)} new assemblies needed</span></div></article>
        </section>
        <nav ref={sectionNav} className={s.tabs} aria-label="Cruzer sections">{(['overview', 'materials', 'activity', 'alerts'] as View[]).map(tab => <button key={tab} aria-current={view === tab ? 'page' : undefined} onClick={() => { setMaterialStatus('all'); setView(tab); }}><span>{tab[0].toUpperCase() + tab.slice(1)}</span>{tab === 'alerts' && alerts > 0 && <span className={s.tabCount}>{alerts}</span>}{tab === 'materials' && <span className={s.tabCount}>{dashboard.componentReadiness.length + dashboard.variantComponentReadiness.length}</span>}</button>)}</nav>
        <div className={s.view}>
          {view === 'overview' && <Overview dashboard={dashboard} onMaterials={openMaterials} onAlerts={() => navigateTo('alerts')} onActivity={() => navigateTo('activity')} />}
          {view === 'materials' && <ProductionMaterials key={materialStatus} dashboard={dashboard} colors={colors} initialStatus={materialStatus} />}
          {view === 'activity' && <Activity dashboard={dashboard} colors={dashboard.colorSummary.map(row => row.color)} onDelete={removeEntry} busy={busy} onSync={() => void mutate('/api/sync-sales?all=true', 'POST', 'Tycoon sales synced.')} />}
          {view === 'alerts' && <ProductionAlertsPanel fgSku={fgSku} dashboard={dashboard} />}
        </div>
        <footer className={s.footer}><span>TYCOON <span className={s.divider}>/</span> FR-CRUZER</span><span>Inventory follows recorded inward and production.</span></footer>
      </>}
    </div>
  </div>;
}
