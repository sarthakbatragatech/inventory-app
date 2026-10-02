import { NextResponse } from 'next/server';
import { createOrderSessionClient } from '@/lib/auth/server';
import { isSameOriginRequest, safeReturnPath } from '@/lib/auth/access';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid sign-in request.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || username.length > 254 || !password || password.length > 1024) return NextResponse.json({ error: 'Enter your portal username and password.' }, { status: 400 });
  try {
    const supabase = await createOrderSessionClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email: `${username}@portal.tycoon.local`, password });
    if (error || !data.user) return NextResponse.json({ error: 'Username or password is incorrect.' }, { status: 401 });
    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', data.user.id).maybeSingle();
    if (!profile || !['admin', 'viewer'].includes(profile.role)) {
      await supabase.auth.signOut({ scope: 'local' });
      return NextResponse.json({ error: 'Your account does not have portal access. Contact an owner.' }, { status: 403 });
    }
    return NextResponse.json({ next: profile.role === 'admin' ? safeReturnPath(body?.next) : '/forbidden' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Sign-in is temporarily unavailable. Please try again.' }, { status: 503 });
  }
}
