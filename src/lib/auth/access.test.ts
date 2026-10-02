import assert from 'node:assert/strict';
import test from 'node:test';
import { isInventoryAdmin, isReadMethod, isSameOriginRequest, safeReturnPath } from './access';

test('only current owner profiles have Inventory access', () => {
  assert.equal(isInventoryAdmin(null), false);
  assert.equal(isInventoryAdmin({ userId: 'u', username: 'factory', role: 'viewer' }), false);
  assert.equal(isInventoryAdmin({ userId: 'u', username: 'owner', role: 'admin' }), true);
});

test('mutation origin checks reject absent, opaque, cross-origin and malformed origins', () => {
  const request = (origin?: string) => new Request('https://tycoon-inventory.vercel.app/api/items', {
    method: 'POST', headers: origin ? { origin } : {},
  });
  for (const origin of [undefined, 'null', 'https://attacker.invalid', 'https://tycoon-inventory.vercel.app.attacker.invalid', 'http://tycoon-inventory.vercel.app', 'not a URL']) {
    assert.equal(isSameOriginRequest(request(origin)), false, String(origin));
  }
  assert.equal(isSameOriginRequest(request('https://tycoon-inventory.vercel.app')), true);
});

test('only safe HTTP methods can omit an origin', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(isReadMethod(method), true);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(isReadMethod(method), false);
});

test('login return paths remain local pages and cannot invoke mutations', () => {
  assert.equal(safeReturnPath('/stock?family=FR'), '/stock?family=FR');
  for (const path of [null, undefined, '', 'https://attacker.invalid', '//attacker.invalid', '/\\attacker.invalid', '/api/sync-sales', '/api/auth/logout', '/login', '/forbidden', '/stock\r\nLocation: https://attacker.invalid']) {
    assert.equal(safeReturnPath(path), '/', String(path));
  }
});
