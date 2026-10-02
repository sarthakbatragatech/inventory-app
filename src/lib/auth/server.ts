import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getOrderAuthConfig, inventoryCookieOptions } from './config';
import { isInventoryAdmin, isReadMethod, isSameOriginRequest, type InventoryIdentity } from './access';

export async function createOrderSessionClient() {
  const cookieStore = await cookies();
  const { url, key } = getOrderAuthConfig();
  return createServerClient(url, key, {
    cookieOptions: inventoryCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Proxy refreshes cookies when a Server Component cannot write them.
        }
      },
    },
  });
}

export const getInventoryIdentity = cache(async (): Promise<InventoryIdentity | null> => {
  const supabase = await createOrderSessionClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  // Check the current profile, rather than trusting editable metadata or a cached role.
  const { data: profile, error: profileError } = await supabase.from('user_profiles')
    .select('id, username, role').eq('id', user.id).maybeSingle();
  if (profileError || !profile || !['admin', 'viewer'].includes(profile.role)) return null;
  return { userId: profile.id, username: profile.username, role: profile.role };
});

export async function requireInventoryAdminPage() {
  const identity = await getInventoryIdentity();
  if (!identity) redirect('/login');
  if (!isInventoryAdmin(identity)) redirect('/forbidden');
  return identity;
}

export async function requireInventoryAdmin(request: Request): Promise<NextResponse | null> {
  try {
    const identity = await getInventoryIdentity();
    if (!identity) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    if (!isInventoryAdmin(identity)) return NextResponse.json({ error: 'Inventory is available to owner accounts only.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    if (!isReadMethod(request.method) && !isSameOriginRequest(request)) return NextResponse.json({ error: 'This request must come from the Inventory app.' }, { status: 403 });
    return null;
  } catch {
    return NextResponse.json({ error: 'Sign-in is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
