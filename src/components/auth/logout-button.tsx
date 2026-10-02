'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function signOut() {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error();
      router.replace('/login');
      router.refresh();
    } catch {
      setError('Could not sign out. Try again.');
    } finally {
      setPending(false);
    }
  }
  return <span className="inline-flex flex-wrap items-center gap-2"><button type="button" onClick={signOut} disabled={pending} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-60">{pending ? 'Signing out…' : 'Sign out'}</button>{error ? <span role="alert" className="text-xs text-red-700">{error}</span> : null}</span>;
}
