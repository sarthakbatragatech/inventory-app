import 'server-only';

export function getOrderAuthConfig() {
  const url = process.env.ORDER_SUPABASE_URL?.trim();
  const key = process.env.ORDER_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) throw new Error('Inventory sign-in is not configured.');
  return { url, key };
}

export const inventoryCookieOptions = {
  name: 'tycoon-inventory-auth',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export const ORDER_DISPATCH_URL = 'https://tycoon-portal.vercel.app/dispatch-planning';
