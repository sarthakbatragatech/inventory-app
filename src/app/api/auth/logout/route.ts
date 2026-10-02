import { NextResponse } from 'next/server';
import { createOrderSessionClient } from '@/lib/auth/server';
import { isSameOriginRequest } from '@/lib/auth/access';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Invalid sign-out request.' }, { status: 403 });
  try {
    const supabase = await createOrderSessionClient();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) return NextResponse.json({ error: 'Could not sign out. Please try again.' }, { status: 503 });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not sign out. Please try again.' }, { status: 503 });
  }
}
