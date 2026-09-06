import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAllRows } from './supabase-pagination';

test('ledger reads continue past the Supabase 1000 row limit', async () => {
  const source = Array.from({ length: 2013 }, (_, id) => ({ id }));
  const windows: number[][] = [];
  const rows = await loadAllRows<{ id: number }>(async (from, to) => {
    windows.push([from, to]);
    return { data: source.slice(from, to + 1), error: null };
  }, 'Ledger');
  assert.deepEqual(rows, source);
  assert.deepEqual(windows, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('a failed later page cannot become a silently partial stock total', async () => {
  await assert.rejects(() => loadAllRows(async (from) => from === 0
    ? { data: Array.from({ length: 1000 }, () => ({})), error: null }
    : { data: null, error: { message: 'connection unavailable' } }, 'Ledger'), /Ledger: connection unavailable/);
});
