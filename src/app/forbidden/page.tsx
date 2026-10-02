import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/auth/logout-button';
import { getInventoryIdentity } from '@/lib/auth/server';
import { ORDER_DISPATCH_URL } from '@/lib/auth/config';

export default async function ForbiddenPage() {
  const identity = await getInventoryIdentity();
  if (!identity) redirect('/login');
  if (identity.role === 'admin') redirect('/');
  return (
    <div className="flex min-h-[75vh] items-center justify-center bg-neutral-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-950">Use the Order Portal</h1>
        <p className="mt-4 text-base leading-7 text-neutral-600">Your account can view pending orders, dispatch schedules, and order details in the Order Portal. Inventory is available to owners only.</p>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <a href={ORDER_DISPATCH_URL} className="rounded-xl bg-neutral-950 px-4 py-3 text-sm font-medium text-white">Open dispatch schedule</a>
          <LogoutButton />
        </div>
      </section>
    </div>
  );
}
