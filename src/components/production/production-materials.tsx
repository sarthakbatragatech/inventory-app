'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import type { ProductionComponentReadiness, ProductionDashboard } from '@/lib/production';
import { FR_CRUZER_PART_REFERENCES } from '@/lib/fr-cruzer-part-reference';
import { ProductionBomReference } from './production-bom-reference';
import { csvDownload, dateLabel, quantity } from './production-ui';
import s from './production.module.css';

type Material = Omit<ProductionComponentReadiness, 'requiredForOpenOrdersQty' | 'shortageForOpenOrdersQty'> & {
  requiredForOpenOrdersQty: number | null;
  shortageForOpenOrdersQty: number | null;
  colors?: string[];
};

const weightFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 6 });

export function EstimatedMark() {
  return <span className={s.estimatedMark}>Estimated</span>;
}

function StockQuantity({ value, row, unit }: { value: number | null; row: Material; unit?: string | null }) {
  return <>{quantity(value, unit)}{row.hasEstimatedStock && value != null && <EstimatedMark />}</>;
}

function EstimateDetails({ row }: { row: Material }) {
  if (!row.inwardEstimates.length) return null;
  return <details className={s.estimateDetails}>
    <summary>{row.hasEstimatedStock ? 'Estimate details' : 'Inward conversion history'}<span className={s.srOnly}> for {row.componentName}</span></summary>
    <ul>{row.inwardEstimates.map((estimate, index) => <li key={estimate.inwardId ?? index}>
      <span>Inward · {dateLabel(estimate.inwardDate)}</span>
      <strong>{quantity(estimate.originalKg)} kg ÷ {weightFormatter.format(estimate.kgPerPc)} kg/pc = {quantity(estimate.estimatedPcs)} pcs</strong>
      <span>{estimate.method === 'current-lot-average' ? 'This lot’s average' : 'Previous inward average'} · {dateLabel(estimate.referenceInwardDate)}{estimate.referenceRawRowNo != null && <> · Excel row {estimate.referenceRawRowNo}</>}</span>
      <span>{estimate.referenceBasis === 'recorded-kg-and-pcs' ? 'From recorded lot kg and piece count.' : 'From the recorded average weight.'}</span>
    </li>)}</ul>
    <p>Rounded down per inward lot. {row.hasEstimatedStock ? 'Stock and dependent capacity are provisional.' : 'Current stock does not depend on these historical estimates.'} The accountant’s updated Excel replaces these estimates when imported.</p>
  </details>;
}

function Photo({ row }: { row: Material }) {
  const [failed, setFailed] = useState(false);
  const reference = FR_CRUZER_PART_REFERENCES[row.componentSku];
  const isMould = reference?.photoKind === 'mould';
  const description = isMould ? `Mould reference for ${row.componentName}; colour not representative` : row.componentName;
  return row.photoUrl && !failed ? <span className={s.photoWithLabel}><a href={row.photoUrl} target="_blank" rel="noopener noreferrer" className={s.photo} aria-label={`View ${description}`} title={reference?.source}>
    <Image src={row.photoUrl} alt={description} width={120} height={100} unoptimized onError={() => setFailed(true)} />
  </a>{isMould && <span className={s.photoReferenceLabel}>Mould ref.</span>}</span> : <span className={s.photo} title="No verified component photo in the supplied sources" aria-label="Photo not available"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9v9M3 8l9 4 9-4M7.5 5.5l9 5" /></svg></span>;
}

function PartReference({ row }: { row: Material }) {
  const reference = FR_CRUZER_PART_REFERENCES[row.componentSku];
  if (!reference) return null;
  return <details className={s.partReference}>
    <summary>{reference.review ? 'Confirm BOM quantity' : 'Part / kit reference'}<span className={s.srOnly}> for {row.componentName}</span></summary>
    {reference.contents && <p>{reference.contents}</p>}
    {reference.review && <p>{reference.review}</p>}
    <small>Audit 07 Sep 2026 · Source: {reference.source}</small>
  </details>;
}

function Inward({ row }: { row: Material }) {
  return <><span>{dateLabel(row.lastInwardDate)}</span>{row.lastInwardQty != null && <small>+{quantity(row.lastInwardQty, row.lastInwardUnit)}{row.lastInwardEstimated && <EstimatedMark />}</small>}</>;
}

export function ProductionMaterials({ dashboard, colors, initialStatus = 'all' }: {
  dashboard: ProductionDashboard; colors: string[]; initialStatus?: string;
}) {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState('all');
  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState('priority');
  const allRows = useMemo<Material[]>(() => [...dashboard.componentReadiness, ...dashboard.variantComponentReadiness], [dashboard]);
  const rows = useMemo(() => allRows.filter(row => {
    const matchesText = `${row.componentName} ${row.componentSku} ${FR_CRUZER_PART_REFERENCES[row.componentSku]?.searchTerms ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesScope = scope === 'all' || (scope === 'shared' ? !row.colors?.length : row.colors?.includes(scope));
    const matchesStatus = status === 'all' || (status === 'bom-review' && !!FR_CRUZER_PART_REFERENCES[row.componentSku]?.review) || (status === 'units' && row.hasUnitConflict) || (status === 'estimated' && row.hasEstimatedStock) || (!row.hasUnitConflict && ((status === 'purchase' && (row.shortageForOpenOrdersQty ?? 0) > 0) || (status === 'negative' && row.availableQty < 0) || (status === 'zero' && row.buildableQty === 0)));
    return matchesText && matchesScope && matchesStatus;
  }).sort((a, b) => {
    if (sort === 'name') return a.componentName.localeCompare(b.componentName);
    if (sort === 'stock') return a.availableQty - b.availableQty;
    return Number(b.hasUnitConflict) - Number(a.hasUnitConflict) || Number(b.availableQty < 0) - Number(a.availableQty < 0) || Number(b.buildableQty === 0) - Number(a.buildableQty === 0) || (b.shortageForOpenOrdersQty ?? 0) - (a.shortageForOpenOrdersQty ?? 0) || a.buildableQty - b.buildableQty;
  }), [allRows, scope, search, sort, status]);
  const purchaseCount = allRows.filter(row => !row.hasUnitConflict && (row.shortageForOpenOrdersQty ?? 0) > 0).length;

  function exportRows() {
    csvDownload(`FR-CRUZER-materials-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Component', 'SKU', 'Colours', 'Stage', 'Per bike', 'Unit', 'Inward', 'Consumed', 'Available', 'Part capacity (bikes)', 'Net requirement', 'To order', 'Validation', 'Inward units (recorded + planning)', 'Current stock uses estimates', 'Historical estimated inward (pcs)', 'Inward estimation provenance (JSON)', 'Last inward date', 'Last inward quantity', 'Last inward unit', 'Last inward estimated'],
      ...rows.map(row => [row.componentName, row.componentSku, row.colors?.join('; ') || 'Shared', row.consumptionStage, row.qtyPerFg, row.unit, row.hasUnitConflict ? null : row.inwardQty, row.consumedQty, row.hasUnitConflict ? null : row.availableQty, row.hasUnitConflict ? null : row.buildableQty, row.requiredForOpenOrdersQty, row.hasUnitConflict ? null : row.shortageForOpenOrdersQty, row.hasUnitConflict ? 'Check units: conversion required' : row.hasEstimatedStock ? 'Provisional: rounded down per lot; updated Excel replaces estimates' : '', row.inwardUnits.join('; '), row.hasEstimatedStock ? 'Yes' : 'No', row.estimatedInwardQty, JSON.stringify(row.inwardEstimates), row.lastInwardDate, row.lastInwardQty, row.lastInwardUnit, row.lastInwardEstimated ? 'Yes' : 'No']),
    ].map((cells, index) => index === 0
      ? [...cells, 'BOM audit 07 Sep 2026: confirmation needed', 'Part / kit evidence source']
      : [...cells, FR_CRUZER_PART_REFERENCES[rows[index - 1].componentSku]?.review ?? '', FR_CRUZER_PART_REFERENCES[rows[index - 1].componentSku]?.source ?? '']));
  }

  return <section className={s.panel} aria-labelledby="materials-heading">
    <div className={s.panelHeading}><div><h2 id="materials-heading">Materials &amp; readiness</h2><p>{allRows.length} components · {purchaseCount} shared {purchaseCount === 1 ? 'part' : 'parts'} to order</p></div><button className={s.button} onClick={exportRows} disabled={!rows.length}>Export CSV <span aria-hidden="true">↓</span></button></div>
    {dashboard.fgSku === 'FR-CRUZER' && <ProductionBomReference />}
    <div className={s.filters}>
      <label className={s.search}><span className={s.srOnly}>Search components</span><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10" cy="10" r="6.5" /><path d="m15 15 5 5" /></svg><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or SKU…" type="search" /></label>
      <label><span className={s.srOnly}>Component scope</span><select value={scope} onChange={e => setScope(e.target.value)}><option value="all">All colours &amp; shared</option><option value="shared">Shared parts</option>{colors.map(color => <option key={color} value={color}>{color} parts</option>)}</select></label>
      <label><span className={s.srOnly}>Stock status</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All stock</option><option value="purchase">To order</option><option value="negative">Negative stock</option><option value="zero">Zero capacity</option><option value="estimated">Estimated stock</option><option value="units">Check units</option><option value="bom-review">Confirm BOM quantity</option></select></label>
      <label><span className={s.srOnly}>Sort materials</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="priority">Priority first</option><option value="name">Name A–Z</option><option value="stock">Lowest stock</option></select></label>
    </div>
    <div className={s.tableNote}><span aria-live="polite">{rows.length} of {allRows.length} parts</span><details><summary>How quantities work</summary><p>Stock = inward − recorded consumption. Net need deducts ready stock and existing WIP, using each part’s assembly or packing stage. To order = net need − stock, floored at zero. Colour-part demand stays unassigned because orders have no colour split. Part capacity is not the capacity of the whole bike. Estimated quantities convert kg to whole pieces using a recorded lot average; open a part’s estimate details for the source.</p></details></div>
    {rows.length ? <>
      <div className={s.desktopMaterials}>
        <table className={s.materialTable}><caption className={s.srOnly}>Cruzer components, stock, net requirements and last inward</caption><thead><tr><th scope="col"><span className={s.srOnly}>Photo</span></th><th scope="col">Component</th><th scope="col">Per bike</th><th scope="col" className={s.numeric}>Stock</th><th scope="col" className={s.numeric}>Part capacity</th><th scope="col" className={s.numeric}>Net need</th><th scope="col" className={s.numeric}>To order</th><th scope="col" className={s.numeric}>Last inward</th></tr></thead><tbody>
          {rows.map(row => <tr key={row.componentItemId} className={row.availableQty < 0 ? s.negativeRow : undefined}>
            <td><Photo row={row} /></td><th scope="row"><span className={s.componentName}>{row.componentName.replace(/^FR[ -]?001\s*/i, '')}</span><small className={s.sku}>{row.componentSku}</small>{row.colors && <small>{row.colors.join(' · ')}</small>}<PartReference row={row} /><EstimateDetails row={row} /></th>
            <td>{quantity(row.qtyPerFg, row.unit)}<small>{row.consumptionStage === 'assembled' ? 'Assembly' : row.consumptionStage === 'packed' ? 'Packing' : 'Mixed'}</small></td>
            <td className={`${s.numeric} ${!row.hasUnitConflict && row.availableQty < 0 ? s.danger : ''}`} title={row.hasUnitConflict ? `Inward units: ${row.inwardUnits.join(', ')}. Convert weight to pieces before using stock.` : `${quantity(row.inwardQty)} inward − ${quantity(row.consumedQty)} consumed${row.hasEstimatedStock ? ' (includes estimated inward)' : ''}`}>{row.hasUnitConflict ? <span className={s.shortage}>Check units</span> : <StockQuantity value={row.availableQty} row={row} />}</td>
            <td className={s.numeric}>{row.hasUnitConflict ? '—' : <StockQuantity value={row.buildableQty} row={row} />}</td><td className={s.numeric}>{quantity(row.requiredForOpenOrdersQty)}</td>
            <td className={s.numeric}>{row.hasUnitConflict ? '—' : row.shortageForOpenOrdersQty == null ? <span className={s.muted} title="Assign an order colour mix to calculate">Unassigned</span> : <span className={row.shortageForOpenOrdersQty > 0 ? s.shortage : s.muted}><StockQuantity value={row.shortageForOpenOrdersQty} row={row} /></span>}</td>
            <td className={`${s.numeric} ${s.lastInward}`}><Inward row={row} /></td>
          </tr>)}
        </tbody></table>
      </div>
      <div className={s.mobileMaterials}>{rows.map(row => <article key={row.componentItemId} className={`${s.materialCard} ${row.availableQty < 0 ? s.negativeRow : ''}`}>
        <div className={s.materialCardTitle}><Photo row={row} /><div><h3>{row.componentName.replace(/^FR[ -]?001\s*/i, '')}</h3><small>{row.componentSku}</small></div>{row.availableQty < 0 && <span className={s.badgeDanger}>Negative</span>}</div>
        {row.colors && <p className={s.colorNote}>{row.colors.join(' · ')}</p>}
        {row.hasUnitConflict && <p className={s.colorNote}>Check units: inward includes {row.inwardUnits.join(' + ')}. A weight-to-piece conversion is needed.</p>}
        <PartReference row={row} /><EstimateDetails row={row} />
        <dl className={s.materialNumbers}><div><dt>Stock</dt><dd className={!row.hasUnitConflict && row.availableQty < 0 ? s.danger : ''}>{row.hasUnitConflict ? 'Check units' : <StockQuantity value={row.availableQty} row={row} unit={row.unit} />}</dd></div><div><dt>Per bike · {row.consumptionStage === 'packed' ? 'packing' : row.consumptionStage === 'mixed' ? 'mixed stages' : 'assembly'}</dt><dd>{quantity(row.qtyPerFg, row.unit)}</dd></div><div><dt>Part capacity</dt><dd>{row.hasUnitConflict ? '—' : <StockQuantity value={row.buildableQty} row={row} unit="bikes" />}</dd></div><div><dt>Net need</dt><dd>{quantity(row.requiredForOpenOrdersQty, row.unit)}</dd></div><div><dt>To order</dt><dd className={!row.hasUnitConflict && (row.shortageForOpenOrdersQty ?? 0) > 0 ? s.danger : ''}>{row.hasUnitConflict ? '—' : row.shortageForOpenOrdersQty == null ? 'Unassigned' : <StockQuantity value={row.shortageForOpenOrdersQty} row={row} unit={row.unit} />}</dd></div></dl>
        <div className={s.cardInward}><span>Last inward</span><span><Inward row={row} /></span></div>
      </article>)}</div>
    </> : <div className={s.empty}><h3>No matching components</h3><button className={s.button} onClick={() => { setSearch(''); setScope('all'); setStatus('all'); }}>Clear filters</button></div>}
  </section>;
}
