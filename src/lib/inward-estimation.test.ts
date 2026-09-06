import assert from 'node:assert/strict';
import test from 'node:test';
import { isPieceUnit, normalizeInwardRows, type InwardEstimationRow } from './inward-estimation';
import { calculateBuildableQuantity, hasMassCountUnitConflict } from './production-analytics';

const pieceIds = new Set(['red-wheel', 'white-wheel']);
const colors = new Map([['red-wheel', 'RED'], ['white-wheel', 'WHITE']]);
function row(id: string, date: string, raw: Record<string, unknown>, extra: Partial<InwardEstimationRow> = {}): InwardEstimationRow {
  return { id, item_id: 'red-wheel', inward_date: date, quantity: Number(raw.Kgs ?? 0), unit: 'KGS', color: 'Red', raw_row_no: 2, raw_payload: raw, ...extra };
}

test('recorded pieces win over weights and rounded averages without estimating', () => {
  const original = row('actual', '2026-07-26', { Pcs: 1010, Kgs: 65.71, 'Avg W.': 0.065 });
  const [actual] = normalizeInwardRows([original], pieceIds);
  assert.equal(actual.quantity, 1010);
  assert.equal(actual.unit, 'PCS');
  assert.equal(actual.estimate, null);
  assert.equal(original.quantity, 65.71);
  assert.equal(original.unit, 'KGS');
  assert.notEqual(actual, original);
});

test('real red and white inward weights use their last recorded lot ratio', () => {
  const actuals = [
    row('red-july', '2026-07-26', { Pcs: 1010, Kgs: 65.71, 'Avg W.': 0.065 }),
    row('white-july', '2026-07-28', { Pcs: 288, Kgs: 18.805, 'Avg W.': 0.065 }, { item_id: 'white-wheel', color: 'White' }),
  ];
  const inward = [
    row('red-sep2', '2026-09-02', { Kgs: 34.71 }),
    row('red-sep3', '2026-09-03', { Kgs: 52.56 }, { color: null }),
    row('red-sep4', '2026-09-04', { Kgs: 14.64 }, { color: null }),
    row('white-sep2', '2026-09-02', { Kgs: 70 }, { item_id: 'white-wheel', color: 'White' }),
    row('white-sep4', '2026-09-04', { Kgs: 88.74 }, { item_id: 'white-wheel', color: null }),
  ];
  const calculated = normalizeInwardRows([...inward, ...actuals], pieceIds, colors).slice(0, 5);
  assert.deepEqual(calculated.map((lot) => lot.quantity), [533, 807, 225, 1072, 1359]);
  assert.deepEqual(calculated.map((lot) => lot.estimate?.referenceInwardId), ['red-july', 'red-july', 'red-july', 'white-july', 'white-july']);
  assert.equal(calculated[1].estimate?.normalizedColor, 'RED');
  assert.equal(calculated[0].estimate?.kgPerPc, 65.71 / 1010);
  assert.equal(calculated[0].estimate?.inwardDate, '2026-09-02');
  assert.equal(calculated[0].estimate?.referenceBasis, 'recorded-kg-and-pcs');

  const normalized = normalizeInwardRows([...inward, ...actuals], pieceIds, colors);
  for (const [itemId, consumedQty, expectedBalance] of [['red-wheel', 1083, 1492], ['white-wheel', 260, 2459]] as const) {
    const components = normalized.filter((lot) => lot.item_id === itemId);
    const balance = components.reduce((total, lot) => total + (lot.quantity ?? 0), 0) - consumedQty;
    const hasUnitConflict = hasMassCountUnitConflict('pcs', components.map((lot) => lot.unit ?? null));
    assert.equal(balance, expectedBalance);
    assert.equal(hasUnitConflict, false);
    assert.equal(calculateBuildableQuantity([{ qtyPerFg: 1, availableQty: balance, hasUnitConflict }]), expectedBalance);
  }
});

test('legacy brown 2125 and guard 2126 weights use measured latest-lot ratios, not pooled stored pieces', () => {
  const ids = new Set(['brown-2125', 'guard-2126']);
  const input = [
    row('brown-prior', '2026-07-25', { Pcs: 470, Kgs: 29.94 }, { item_id: 'brown-2125', color: 'Brown', quantity: 470, unit: 'PCS' }),
    row('brown-current', '2026-09-04', { Kgs: 74.18 }, { item_id: 'brown-2125', color: 'Brown', quantity: 1134, unit: 'PCS' }),
    row('guard-prior', '2026-07-25', { Pcs: 3712, Kgs: 244.98 }, { item_id: 'guard-2126', color: 'Brown', quantity: 3712, unit: 'PCS' }),
    row('guard-first', '2026-09-03', { Kgs: 147.57 }, { item_id: 'guard-2126', color: 'Brown', quantity: 2236, unit: 'PCS' }),
    row('guard-second', '2026-09-04', { Kgs: 53.97 }, { item_id: 'guard-2126', color: 'Brown', quantity: 818, unit: 'PCS' }),
  ];
  const output = normalizeInwardRows(input, ids);
  assert.deepEqual(output.map((lot) => lot.quantity), [470, 1164, 3712, 2236, 817]);
  assert.deepEqual(output.map((lot) => lot.estimate?.referenceInwardId ?? null), [null, 'brown-prior', null, 'guard-prior', 'guard-prior']);
  assert.equal(output[1].estimate?.originalQuantity, 1134);
  assert.equal(output[3].estimate?.originalQuantity, 2236);
  assert.equal(output[3].estimate?.method, 'previous-inward-average');
});

test('uses newest strictly earlier matching lot, not future, same-day, other-colour or other-item', () => {
  const input = [
    row('target', '2026-09-04', { Kgs: 10 }),
    row('old', '2026-07-01', { Pcs: 100, Kgs: 10 }),
    row('latest', '2026-08-01', { Pcs: 100, Kgs: 20 }, { color: '  rEd  ' }),
    row('future', '2026-09-05', { Pcs: 100, Kgs: 1 }),
    row('same-day', '2026-09-04', { Pcs: 100, Kgs: 2 }),
    row('other-colour', '2026-09-03', { Pcs: 100, Kgs: 3 }, { color: 'White' }),
    row('other-item', '2026-09-03', { Pcs: 100, Kgs: 4 }, { item_id: 'white-wheel' }),
  ];
  const [result] = normalizeInwardRows(input, pieceIds, colors);
  assert.equal(result.quantity, 50);
  assert.equal(result.estimate?.referenceInwardId, 'latest');
  const withoutEarlierMatch = normalizeInwardRows(input.filter((lot) => !['old', 'latest'].includes(lot.id!)), pieceIds, colors)[0];
  assert.equal(withoutEarlierMatch.quantity, 10);
  assert.equal(withoutEarlierMatch.unit, 'KGS');
  assert.equal(withoutEarlierMatch.estimate, null);
});

test('current lot average takes priority and header variants are recognized', () => {
  const input = [
    row('current', '2026-09-04', { ' kGS ': '10', 'Avg W,\n In Kgs': '0.25', Pcs: 0 }),
    row('prior', '2026-09-03', { ' PIECES ': '1,000', KG: '100', 'Avg W.': 0.099 }),
  ];
  const [current, prior] = normalizeInwardRows(input, pieceIds);
  assert.equal(current.quantity, 40);
  assert.equal(current.estimate?.method, 'current-lot-average');
  assert.equal(current.estimate?.referenceInwardId, 'current');
  assert.equal(current.estimate?.referenceBasis, 'recorded-average');
  assert.equal(prior.quantity, 1000);
  assert.equal(prior.estimate, null);
});

test('recorded previous average is usable, but calculated estimates never become references', () => {
  const input = [
    row('reference', '2026-07-26', { Kgs: 10, 'Avg W.': 0.3 }),
    row('first-estimate', '2026-08-01', { Kgs: 10 }),
    row('later-estimate', '2026-09-01', { Kgs: 10 }),
  ];
  const firstPass = normalizeInwardRows(input, pieceIds);
  assert.equal(firstPass[1].quantity, 33);
  assert.equal(firstPass[2].estimate?.referenceInwardId, 'reference');
  assert.deepEqual(normalizeInwardRows(firstPass, pieceIds), firstPass.map((lot) => ({
    ...lot,
    estimate: lot.estimate ? { ...lot.estimate, originalQuantity: lot.quantity, originalUnit: lot.unit ?? null } : null,
  })));
  const withoutRecordedReference = normalizeInwardRows(firstPass.slice(1), pieceIds);
  assert.deepEqual(withoutRecordedReference.map((lot) => [lot.quantity, lot.unit, lot.estimate]), [[10, 'KGS', null], [10, 'KGS', null]]);
});

test('legacy pooled conversions are recomputed or restored to raw kg, never treated as actual pieces', () => {
  const legacy = row('legacy', '2026-09-04', { Kgs: 10, Pcs: null }, { quantity: 999, unit: 'PCS' });
  const previous = row('valid-source', '2026-09-01', { Pcs: 100, Kgs: 20 });
  const [estimated] = normalizeInwardRows([legacy, previous], pieceIds);
  assert.equal(estimated.quantity, 50);
  assert.equal(estimated.estimate?.originalQuantity, 999);
  const [unresolved] = normalizeInwardRows([legacy], pieceIds);
  assert.equal(unresolved.quantity, 10);
  assert.equal(unresolved.unit, 'KGS');
  const onlyLegacy = normalizeInwardRows([legacy, row('later', '2026-09-05', { Kgs: 1 })], pieceIds);
  assert.equal(onlyLegacy[1].estimate, null);
});

test('corrected workbook piece counts automatically replace an estimate', () => {
  const current = row('current', '2026-09-04', { Kgs: 10, 'Avg W.': 0.3 });
  assert.equal(normalizeInwardRows([current], pieceIds)[0].quantity, 33);
  const corrected = { ...current, raw_payload: { ...current.raw_payload, Pcs: 35 } };
  const [result] = normalizeInwardRows([corrected], pieceIds);
  assert.equal(result.quantity, 35);
  assert.equal(result.estimate, null);
});

test('does not infer pairs, sets or unrelated mass components', () => {
  assert.equal(isPieceUnit('Nos.'), true);
  assert.equal(isPieceUnit('pairs'), false);
  const input = [
    row('set', '2026-09-04', { Kgs: 10, 'Avg W.': 0.2 }, { unit: 'set' }),
    row('pair', '2026-09-04', { Kgs: 10, 'Avg W.': 0.2, Unit: 'pairs' }),
    row('unrelated', '2026-09-04', { Kgs: 10, 'Avg W.': 0.2 }, { item_id: 'raw-resin' }),
  ];
  const output = normalizeInwardRows(input, pieceIds);
  assert.deepEqual(output, input.map((lot) => ({ ...lot, estimate: null })));
});

test('canonical colour only fills missing values and never overrides an explicit conflicting colour', () => {
  const source = row('red-reference', '2026-09-01', { Pcs: 100, Kgs: 20 });
  const output = normalizeInwardRows([
    row('blank', '2026-09-04', { Kgs: 10 }, { color: null }),
    row('explicit-white', '2026-09-04', { Kgs: 10 }, { color: 'White' }),
    row('raw-white', '2026-09-04', { Kgs: 10, 'Colour/type': 'White' }, { color: null }),
    source,
  ], pieceIds, colors);
  assert.equal(output[0].quantity, 50);
  assert.equal(output[1].estimate, null);
  assert.equal(output[2].estimate, null);
});

test('rounds down conservatively without losing exact integers to floating point', () => {
  const input = [
    row('exact', '2026-09-04', { Kgs: 0.3, 'Avg W.': 0.1 }),
    row('fraction', '2026-09-04', { Kgs: 0.299999, 'Avg W.': 0.1 }),
    row('less-than-one', '2026-09-04', { Kgs: 0.01, 'Avg W.': 0.1 }),
    row('overflow', '2026-09-04', { Kgs: 1e100, 'Avg W.': 0.1 }),
  ];
  const output = normalizeInwardRows(input, pieceIds);
  assert.deepEqual(output.map((lot) => lot.quantity), [3, 2, 0, 1e100]);
  assert.equal(output[3].estimate, null);
});

test('invalid dates and unusable raw values cannot create a historical reference', () => {
  const input = [
    row('target', '2026-09-04', { Kgs: 10 }),
    row('invalid-date', '2026-02-30', { Pcs: 100, Kgs: 10 }),
    row('zero', '2026-09-01', { Pcs: 0, Kgs: 10, 'Avg W.': 0 }),
    row('negative', '2026-09-01', { Pcs: -10, Kgs: 10, 'Avg W.': -1 }),
    row('formula-error', '2026-09-01', { Kgs: 10, 'Avg W.': '#DIV/0!' }),
    row('infinity', '2026-09-01', { Kgs: 10, 'Avg W.': Infinity }),
  ];
  assert.equal(normalizeInwardRows(input, pieceIds)[0].estimate, null);
  const undated = row('undated', '', { Kgs: 10 });
  assert.equal(normalizeInwardRows([undated, row('valid', '2026-09-01', { Pcs: 100, Kgs: 10 })], pieceIds)[0].estimate, null);
});
