import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBuildableMix, calculateBuildableQuantity, calculateDemandPlanning, dateAgeDays, type CapacityComponent } from './production-analytics';

const part = (componentItemId: string, availableQty: number, qtyPerFg = 1): CapacityComponent => ({ componentItemId, availableQty, qtyPerFg });

test('every colour is constrained by shared stock and two-piece BOM consumption', () => {
  assert.equal(calculateBuildableQuantity([part('pipe', -572, 2), part('aqua', 66)]), 0);
  assert.equal(calculateBuildableQuantity([part('pipe', 13, 2)]), 6);
  assert.equal(calculateBuildableQuantity([part('invalid', 13, 0)]), null);
});

test('shared brown parts are not counted once for each colour', () => {
  assert.deepEqual(calculateBuildableMix([
    [part('red', 7)],
    [part('aqua', 66), part('brown', 100)],
    [part('white', 186), part('brown', 100)],
    [part('green', 19), part('brown', 100)],
  ]), { quantity: 107, isExact: true });
});

test('mix optimiser finds an alternative allocation across overlapping constraints', () => {
  // The first colour spends both limited parts; two separate colours make twice as many bikes.
  assert.deepEqual(calculateBuildableMix([
    [part('a', 12), part('b', 12)],
    [part('a', 12)],
    [part('b', 12)],
  ]), { quantity: 24, isExact: true });
});

test('mix agrees with exhaustive feasible quantities for small varied BOMs', () => {
  let seed = 271;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed; };
  for (let sample = 0; sample < 60; sample += 1) {
    const balances = [1 + random() % 7, 1 + random() % 7, 1 + random() % 7];
    const requirements = Array.from({ length: 3 }, () => balances.map(() => random() % 3));
    for (const row of requirements) if (!row.some((qty) => qty > 0)) row[0] = 1;
    const colors = requirements.map((row) => row.flatMap((qty, index) => qty ? [part(String(index), balances[index], qty)] : []));
    let optimum = 0;
    for (let first = 0; first <= 7; first += 1) for (let second = 0; second <= 7; second += 1) for (let third = 0; third <= 7; third += 1) {
      const quantities = [first, second, third];
      if (balances.every((balance, item) => quantities.reduce((sum, qty, color) => sum + qty * requirements[color][item], 0) <= balance)) optimum = Math.max(optimum, first + second + third);
    }
    assert.deepEqual(calculateBuildableMix(colors), { quantity: optimum, isExact: true });
  }
});

test('orders account for FG and WIP at the right consumption stage', () => {
  assert.deepEqual(calculateDemandPlanning({ pendingOrderQty: 1291, productionTotalQty: 1802, packedTotalQty: 1362, salesTotalQty: 1210, packingCapacityQty: 0 }), {
    readyToDispatchQty: 152, wipAvailableQty: 440, packingRequiredQty: 1139,
    newAssemblyRequiredQty: 699, packingCapacityQty: 0, recommendedPackQty: 0,
    orderCoveragePct: 152 / 1291 * 100,
  });
});

test('packing recommendations never exceed WIP or remaining orders', () => {
  const result = calculateDemandPlanning({ pendingOrderQty: 40, productionTotalQty: 1802, packedTotalQty: 1362, salesTotalQty: 1350, packingCapacityQty: 300 });
  assert.equal(result.recommendedPackQty, 28);
  assert.equal(result.newAssemblyRequiredQty, 0);
  assert.equal(dateAgeDays('2026-08-24', '2026-09-07'), 14);
});

test('inconsistent ledgers do not create negative demand or available WIP', () => {
  const result = calculateDemandPlanning({ pendingOrderQty: 0, productionTotalQty: 4, packedTotalQty: 8, salesTotalQty: 12, packingCapacityQty: 20 });
  assert.equal(result.readyToDispatchQty, 0);
  assert.equal(result.wipAvailableQty, 0);
  assert.equal(result.newAssemblyRequiredQty, 0);
  assert.equal(result.recommendedPackQty, 0);
  assert.equal(result.orderCoveragePct, 100);
});

test('freshness distinguishes absent or invalid dates from activity today', () => {
  assert.equal(dateAgeDays(null, '2026-09-07'), null);
  assert.equal(dateAgeDays('invalid', '2026-09-07'), null);
  assert.equal(dateAgeDays('2026-09-07', '2026-09-07'), 0);
  assert.equal(dateAgeDays('2026-09-06', '2026-09-07'), 1);
});
