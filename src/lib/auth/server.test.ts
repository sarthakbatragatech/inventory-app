import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { Script } from 'node:vm';
import { NextResponse } from 'next/server';
import ts from 'typescript';
import * as access from './access';

type CookieValue = { name: string; value: string; options: Record<string, unknown> };
type SessionOptions = {
  cookieOptions: Record<string, unknown>;
  cookies: { getAll(): { name: string; value: string }[]; setAll(values: CookieValue[]): void };
};
type AuthModule = {
  createOrderSessionClient(): Promise<unknown>;
  getInventoryIdentity(): Promise<access.InventoryIdentity | null>;
  requireInventoryAdmin(request: Request): Promise<Response | null>;
  requireInventoryAdminPage(): Promise<access.InventoryIdentity>;
};
type Scenario = {
  user?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  authError?: unknown;
  profileError?: unknown;
  configError?: boolean;
  readonlyCookies?: boolean;
};

class RedirectSignal extends Error {
  constructor(readonly destination: string) { super(destination); }
}

// Execute the real server guard with no network, production cookies or secrets.
// All module imports are explicit so accidentally using a privileged client fails.
function authHarness(scenario: Scenario = {}) {
  const profile = scenario.profile === undefined
    ? { id: 'verified-user', username: 'synthetic-owner', role: 'admin' }
    : scenario.profile;
  const user = scenario.user === undefined ? { id: 'verified-user' } : scenario.user;
  const cookieValues = [{ name: 'tycoon-inventory-auth.0', value: 'synthetic-cookie' }];
  const cookieWrites: CookieValue[] = [];
  const profileQueries: { table: string; column: string; value: unknown }[] = [];
  let clientOptions: SessionOptions | undefined;
  let verifiedUserCalls = 0;
  const dependencies: Record<string, unknown> = {
    'server-only': {},
    react: { cache: <T>(fn: T) => fn },
    'next/server': { NextResponse },
    'next/navigation': { redirect: (path: string) => { throw new RedirectSignal(path); } },
    'next/headers': {
      cookies: async () => ({
        getAll: () => cookieValues,
        set(name: string, value: string, options: Record<string, unknown>) {
          if (scenario.readonlyCookies) throw new Error('Server Component cookies are read only');
          cookieWrites.push({ name, value, options });
        },
      }),
    },
    './access': access,
    './config': {
      getOrderAuthConfig() {
        if (scenario.configError) throw new Error('configuration-secret-detail');
        return { url: 'https://order-auth.example', key: 'synthetic-publishable-key' };
      },
      inventoryCookieOptions: { name: 'tycoon-inventory-auth', httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
    },
    '@supabase/ssr': {
      createServerClient(url: string, key: string, options: SessionOptions) {
        assert.equal(url, 'https://order-auth.example');
        assert.equal(key, 'synthetic-publishable-key');
        clientOptions = options;
        return {
          auth: {
            async getUser() {
              verifiedUserCalls++;
              return { data: { user }, error: scenario.authError ?? null };
            },
          },
          from(table: string) {
            return {
              select: () => ({
                eq(column: string, value: unknown) {
                  profileQueries.push({ table, column, value });
                  return { maybeSingle: async () => ({ data: profile, error: scenario.profileError ?? null }) };
                },
              }),
            };
          },
        };
      },
    },
  };
  const exports = {};
  const filename = join(__dirname, 'server.ts');
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  new Script(outputText, { filename }).runInNewContext({
    exports,
    require(name: string) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected auth dependency: ${name}`);
      return dependencies[name];
    },
  });
  return {
    module: exports as AuthModule,
    cookieValues,
    cookieWrites,
    profileQueries,
    options: () => clientOptions,
    verifiedUserCalls: () => verifiedUserCalls,
  };
}

function request(method = 'GET', origin?: string) {
  return new Request('https://inventory.example/api/items', {
    method,
    headers: origin ? { Origin: origin } : {},
  });
}

test('Inventory identity verifies the auth user and uses only their current database profile', async () => {
  const harness = authHarness({ user: { id: 'verified-user', user_metadata: { role: 'viewer' } } });
  const identity = await harness.module.getInventoryIdentity();
  assert.equal(identity?.role, 'admin');
  assert.equal(identity?.userId, 'verified-user');
  assert.equal(harness.verifiedUserCalls(), 1);
  assert.deepEqual(harness.profileQueries, [{ table: 'user_profiles', column: 'id', value: 'verified-user' }]);
});

test('Inventory rejects anonymous, invalid-session, missing-profile and unknown-role callers', async () => {
  for (const scenario of [
    { user: null },
    { authError: { message: 'invalid-session-private-detail' } },
    { profile: null },
    { profileError: { message: 'database-private-detail' } },
    { profile: { id: 'verified-user', username: 'synthetic-user', role: 'superuser' } },
  ]) {
    const harness = authHarness(scenario);
    const response = await harness.module.requireInventoryAdmin(request());
    assert.equal(response?.status, 401);
    assert.equal(response?.headers.get('Cache-Control'), 'no-store');
  }
});

test('Factory metadata cannot promote a current viewer profile to Inventory owner', async () => {
  const harness = authHarness({
    user: { id: 'verified-user', user_metadata: { role: 'admin' }, app_metadata: { role: 'admin' } },
    profile: { id: 'verified-user', username: 'synthetic-factory', role: 'viewer' },
  });
  const response = await harness.module.requireInventoryAdmin(request());
  assert.equal(response?.status, 403);
  await assert.rejects(harness.module.requireInventoryAdminPage(), (error) => error instanceof RedirectSignal && error.destination === '/forbidden');
});

test('Owner reads and same-origin writes are allowed, cross-origin or missing-origin writes are denied', async () => {
  const harness = authHarness();
  assert.equal(await harness.module.requireInventoryAdmin(request()), null);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal(await harness.module.requireInventoryAdmin(request(method, 'https://inventory.example')), null);
    for (const origin of [undefined, 'null', 'https://attacker.example', 'https://other.inventory.example']) {
      assert.equal((await harness.module.requireInventoryAdmin(request(method, origin)))?.status, 403);
    }
  }
});

test('Missing auth configuration fails closed without exposing internal error details', async () => {
  const harness = authHarness({ configError: true });
  const response = await harness.module.requireInventoryAdmin(request());
  assert.equal(response?.status, 503);
  assert.equal(response?.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response?.json(), { error: 'Sign-in is temporarily unavailable.' });
});

test('Server page guards redirect missing sessions and preserve verified owner identity', async () => {
  await assert.rejects(authHarness({ user: null }).module.requireInventoryAdminPage(), (error) => error instanceof RedirectSignal && error.destination === '/login');
  assert.equal((await authHarness().module.requireInventoryAdminPage()).username, 'synthetic-owner');
});

test('SSR client uses isolated HttpOnly cookies and forwards refreshed cookie options', async () => {
  const harness = authHarness();
  await harness.module.createOrderSessionClient();
  const options = harness.options();
  assert.ok(options);
  assert.deepEqual(options.cookieOptions, { name: 'tycoon-inventory-auth', httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  assert.deepEqual(options.cookies.getAll(), harness.cookieValues);
  const refresh = { name: 'tycoon-inventory-auth.0', value: 'synthetic-refresh', options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600 } };
  options.cookies.setAll([refresh]);
  assert.deepEqual(harness.cookieWrites, [refresh]);
});

test('Read-only Server Component cookie stores do not break verified session checks', async () => {
  const harness = authHarness({ readonlyCookies: true });
  await harness.module.createOrderSessionClient();
  harness.options()?.cookies.setAll([{ name: 'tycoon-inventory-auth.0', value: 'synthetic-refresh', options: {} }]);
  assert.equal((await harness.module.getInventoryIdentity())?.role, 'admin');
  assert.deepEqual(harness.cookieWrites, []);
});
