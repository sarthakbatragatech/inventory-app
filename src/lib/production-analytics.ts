export type CapacityComponent = {
  componentItemId: string;
  availableQty: number;
  qtyPerFg: number;
};

export function calculateBuildableQuantity(
  components: Array<{ availableQty: number; qtyPerFg: number }>
) {
  if (components.length === 0) return null;
  // An invalid BOM requirement cannot establish a reliable capacity.
  if (components.some((row) => !Number.isFinite(row.qtyPerFg) || row.qtyPerFg <= 0 || !Number.isFinite(row.availableQty))) {
    return null;
  }
  return Math.min(...components.map((row) => Math.floor(Math.max(row.availableQty, 0) / row.qtyPerFg)));
}

/** Maximise a feasible colour mix without spending shared stock more than once. */
export function calculateBuildableMix(colorComponents: CapacityComponent[][]) {
  if (colorComponents.length === 0 || colorComponents.some((rows) => calculateBuildableQuantity(rows) === null)) {
    return { quantity: null, isExact: false };
  }
  const items = [...new Set(colorComponents.flatMap((rows) => rows.map((row) => row.componentItemId)))];
  const available = items.map((id) => Math.max(0, Math.min(...colorComponents.flatMap((rows) => rows.filter((row) => row.componentItemId === id).map((row) => row.availableQty)))));
  const requirements = colorComponents.map((rows) => items.map((id) => rows.filter((row) => row.componentItemId === id).reduce((sum, row) => sum + row.qtyPerFg, 0)));
  let best = 0;
  let nodes = 0;
  let exhausted = false;

  function bounds(start: number, stock: number[]) {
    const individual = requirements.slice(start).map((requirementsForColor) => Math.min(...requirementsForColor.flatMap((qty, index) => qty > 0 ? [Math.floor((stock[index] + 1e-9) / qty)] : [])));
    let upper = individual.reduce((sum, quantity) => sum + quantity, 0);
    // Every shared part also caps the sum of the colours that require it.
    for (let item = 0; item < items.length; item += 1) {
      const using = requirements.slice(start).map((row, index) => ({ qty: row[item], index })).filter((row) => row.qty > 0);
      if (!using.length) continue;
      const pooled = Math.floor((stock[item] + 1e-9) / Math.min(...using.map((row) => row.qty)));
      const outside = individual.reduce((sum, qty, index) => sum + (requirements[start + index][item] > 0 ? 0 : qty), 0);
      upper = Math.min(upper, pooled + outside);
    }
    return { individual, upper };
  }

  function search(start: number, stock: number[], total: number) {
    if (start === requirements.length) {
      best = Math.max(best, total);
      return;
    }
    const { individual, upper } = bounds(start, stock);
    if (total + upper <= best) return;
    if (++nodes > 20_000) {
      exhausted = true;
      return;
    }
    if (start === requirements.length - 1) {
      best = Math.max(best, total + individual[0]);
      return;
    }
    for (let qty = individual[0]; qty >= 0; qty -= 1) {
      search(start + 1, stock.map((balance, index) => balance - requirements[start][index] * qty), total + qty);
      if (best === total + upper || exhausted) break;
    }
  }
  search(0, available, 0);
  return { quantity: best, isExact: !exhausted };
}

export function calculateDemandPlanning(input: {
  pendingOrderQty: number;
  productionTotalQty: number;
  packedTotalQty: number;
  salesTotalQty: number;
  packingCapacityQty: number | null;
}) {
  const pending = Math.max(input.pendingOrderQty, 0);
  const finishedGoods = Math.max(input.packedTotalQty - input.salesTotalQty, 0);
  const readyToDispatchQty = Math.min(pending, finishedGoods);
  const packingRequiredQty = Math.max(pending - readyToDispatchQty, 0);
  const wipAvailableQty = Math.max(input.productionTotalQty - input.packedTotalQty, 0);
  return {
    readyToDispatchQty,
    wipAvailableQty,
    packingRequiredQty,
    newAssemblyRequiredQty: Math.max(packingRequiredQty - wipAvailableQty, 0),
    packingCapacityQty: input.packingCapacityQty,
    recommendedPackQty: input.packingCapacityQty === null ? null : Math.min(wipAvailableQty, packingRequiredQty, input.packingCapacityQty),
    orderCoveragePct: pending === 0 ? 100 : (readyToDispatchQty / pending) * 100,
  };
}

export function dateAgeDays(date: string | null, today: string) {
  if (!date) return null;
  const age = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  return Number.isFinite(age) ? age : null;
}
