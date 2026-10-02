import { Brand } from '@/components/brand';
import { LoginForm } from '@/components/auth/login-form';
import { safeReturnPath } from '@/lib/auth/access';
import { ORDER_DISPATCH_URL } from '@/lib/auth/config';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-[80vh] items-center justify-center bg-neutral-50 px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-7 shadow-sm sm:p-9">
        <Brand compact />
        <h1 className="mt-7 text-2xl font-semibold text-neutral-950">Inventory sign in</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">Owners can sign in with their existing Order Portal username and password.</p>
        <LoginForm next={safeReturnPath(next)} />
        <p className="mt-6 text-sm leading-6 text-neutral-600">Factory staff can view pending orders and dispatch schedules in the <a className="font-medium text-sky-700 underline underline-offset-4" href={ORDER_DISPATCH_URL}>Order Portal</a>.</p>
      </section>
    </div>
  );
}
