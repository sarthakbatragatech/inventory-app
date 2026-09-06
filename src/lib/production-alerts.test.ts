import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProductionAlertPreview } from './production-alerts';
import type { ProductionDashboard } from './production';

function dashboard(hasEstimatedStock: boolean) {
  return {
    fgSku: 'FR-CRUZER', pendingOrderQty: 1291, buildableQty: 0,
    hasEstimatedStock,
    demandPlanning: { readyToDispatchQty: 152, wipAvailableQty: 440, newAssemblyRequiredQty: 699 },
    alerts: [],
  } as unknown as ProductionDashboard;
}

test('WhatsApp draft labels provisional capacity without enabling delivery', () => {
  const preview = buildProductionAlertPreview(dashboard(true), { NODE_ENV: 'test' }, '2026-09-07T00:00:00Z');
  assert.match(preview.messagePreview, /Complete-bike capacity: 0 \(provisional estimate\)/);
  assert.match(preview.messagePreview, /lot|weight/i);
  assert.match(preview.messagePreview, /accountant|Excel/i);
  assert.match(preview.messagePreview, /Open orders: 1,291 bikes/);
  assert.equal(preview.deliveryEnabled, false);
  assert.equal(preview.connectionVerified, false);
});

test('WhatsApp draft does not label verified stock as a provisional estimate', () => {
  const preview = buildProductionAlertPreview(dashboard(false), { NODE_ENV: 'test' }, '2026-09-07T00:00:00Z');
  assert.doesNotMatch(preview.messagePreview, /provisional estimate/);
  assert.equal(preview.mode, 'preview');
  assert.equal(preview.deliveryEnabled, false);
});
