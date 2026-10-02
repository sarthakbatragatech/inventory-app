import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import test from 'node:test';
import { Script } from 'node:vm';
import { NextRequest, NextResponse } from 'next/server.js';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
function findFiles(directory, basename) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? findFiles(join(directory, entry.name), basename)
    : entry.name === basename ? [join(directory, entry.name)] : []);
}

function loadSource(filename, dependencies) {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Script(outputText, { filename }).runInNewContext({
    exports, URL, Request, Response, console, Buffer,
    require(name) {
      if (name === 'next/server') return { NextRequest, NextResponse };
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      // Business dependencies must never execute for rejected requests.
      return new Proxy({}, { get: (_target, key) => {
        if (key === '__esModule') return true;
        return () => assert.fail(`Protected work executed: ${name}.${String(key)}`);
      } });
    },
  });
  return exports;
}

const routes = findFiles(join(root, 'src/app/api'), 'route.ts')
  .filter(filename => !filename.includes('/auth/') && !filename.includes('/cron/'));

test('all business handlers stop anonymous and factory requests before body, params or privileged work', async () => {
  let checked = 0;
  for (const filename of routes) {
    for (const status of [401, 403]) {
      const calls = [];
      const denial = NextResponse.json({ error: 'Denied' }, { status });
      const handlers = loadSource(filename, {
        '@/lib/auth/server': { requireInventoryAdmin: async request => { calls.push(request); return denial; } },
      });
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        if (!handlers[method]) continue;
        if (filename.endsWith('/sync-sales/route.ts') && method === 'GET') continue;
        const request = { method, json: () => assert.fail('Body accessed before authorization') };
        const context = { get params() { assert.fail('Params accessed before authorization'); } };
        const response = await handlers[method](request, context);
        assert.equal(response, denial, `${method} ${relative(root, filename)}`);
        assert.equal(calls.at(-1), request);
        checked++;
      }
    }
  }
  assert.equal(checked, 48, '24 business methods must be protected for both denied caller types');
});

test('GET cannot trigger sales synchronization', async () => {
  const handlers = loadSource(join(root, 'src/app/api/sync-sales/route.ts'), {});
  const response = await handlers.GET(new Request('https://inventory.example/api/sync-sales?all=true'));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'POST');
});

test('an authorized POST retains sales synchronization behavior', async () => {
  const calls = [];
  const sample = { sale_date: '2026-09-01', model_key: 'TEST-SKU', fg_name: 'Test model', category: 'Test', qty: 2, source_item_id: 'test-item' };
  const handlers = loadSource(join(root, 'src/app/api/sync-sales/route.ts'), {
    '@/lib/auth/server': { requireInventoryAdmin: async () => null },
    '@/lib/order-sales': { listOrderPortalSales: async options => { calls.push(['source', options]); return [sample]; } },
    '@/lib/supabaseInventory': { getSupabaseInventoryClient: () => ({ from: table => ({
      upsert: async (rows, options) => { calls.push(['upsert', table, rows, options]); return { error: null }; },
    }) }) },
  });
  const response = await handlers.POST(new Request('https://inventory.example/api/sync-sales', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { mode: 'all', startDate: null, endDate: null, fetched: 1, upserted: 1 });
  assert.equal(calls[1][1], 'daily_fg_sales_import');
  assert.equal(calls[1][2][0].fg_sku, sample.model_key);
  assert.equal(calls[1][2][0].qty, 2);
});

test('every business page checks owner access before rendering or reading data', async () => {
  const pages = findFiles(join(root, 'src/app'), 'page.tsx')
    .filter(filename => !filename.includes('/login/') && !filename.includes('/forbidden/'));
  const denial = new Error('Expected auth redirect');
  for (const filename of pages) {
    let guarded = false;
    const page = loadSource(filename, {
      '@/lib/auth/server': { requireInventoryAdminPage: async () => { guarded = true; throw denial; } },
    }).default;
    await assert.rejects(() => page({}), error => error === denial, relative(root, filename));
    assert.equal(guarded, true);
  }
  assert.equal(pages.length, 13);
});
