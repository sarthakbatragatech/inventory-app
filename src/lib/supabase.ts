import { createClient } from '@supabase/supabase-js';

export function getSupabaseInventoryBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function getSupabaseInventoryServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export function getSupabaseBrowserClient() {
  return getSupabaseInventoryBrowserClient();
}

export function getSupabaseServerClient() {
  return getSupabaseInventoryServerClient();
}
