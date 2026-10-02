'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.get('username'), password: form.get('password'), next }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Could not sign in. Please try again.');
        return;
      }
      router.replace(result.next);
      router.refresh();
    } catch {
      setError('Could not connect. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 space-y-5">
      <div>
        <label htmlFor="username" className="mb-2 block text-sm font-medium text-neutral-800">Username</label>
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-neutral-950 focus:outline-2 focus:outline-sky-600" />
      </div>
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium text-neutral-800">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024} className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-neutral-950 focus:outline-2 focus:outline-sky-600" />
      </div>
      {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-neutral-950 px-4 py-3 font-medium text-white hover:bg-neutral-800 focus:outline-2 focus:outline-offset-2 focus:outline-sky-600 disabled:opacity-60">{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
