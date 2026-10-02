import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getOrderAuthConfig, inventoryCookieOptions } from '@/lib/auth/config';

const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/logout']);

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // This endpoint independently verifies its mandatory automation bearer token.
  if (pathname === '/api/cron/factory-stock-whatsapp') return NextResponse.next();

  let response = NextResponse.next({ request });
  try {
    const { url, key } = getOrderAuthConfig();
    const supabase = createServerClient(url, key, {
      cookieOptions: inventoryCookieOptions,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const { data: { user } } = await supabase.auth.getUser();
    const finish = (target: NextResponse) => {
      response.cookies.getAll().forEach(cookie => target.cookies.set(cookie));
      target.headers.set('Cache-Control', 'private, no-store');
      return target;
    };
    if (PUBLIC_PATHS.has(pathname)) return finish(response);
    if (!user) {
      if (pathname.startsWith('/api/')) return finish(NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 }));
      const target = new URL('/login', request.url);
      target.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      return finish(NextResponse.redirect(target));
    }
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile || !['admin', 'viewer'].includes(profile.role)) {
      if (pathname.startsWith('/api/')) return finish(NextResponse.json({ error: 'Your account does not have portal access.' }, { status: 401 }));
      return finish(NextResponse.redirect(new URL('/login', request.url)));
    }
    if (profile.role !== 'admin' && pathname !== '/forbidden') {
      if (pathname.startsWith('/api/')) return finish(NextResponse.json({ error: 'Inventory is available to owner accounts only.' }, { status: 403 }));
      return finish(NextResponse.redirect(new URL('/forbidden', request.url)));
    }
    return finish(response);
  } catch {
    // Keep login available so users can see a useful sign-in error during an outage.
    if (PUBLIC_PATHS.has(pathname)) return response;
    return NextResponse.json({ error: 'Sign-in is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
