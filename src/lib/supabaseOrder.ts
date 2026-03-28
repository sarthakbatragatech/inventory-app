import { createClient } from '@supabase/supabase-js';

function requireEnv(name: 'ORDER_SUPABASE_URL' | 'ORDER_SUPABASE_SERVICE_ROLE_KEY' | 'ORDER_SUPABASE_ANON_KEY') {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseOrderClient() {
  const supabaseUrl = requireEnv('ORDER_SUPABASE_URL');
  const supabaseKey =
    process.env.ORDER_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.ORDER_SUPABASE_ANON_KEY?.trim();

  if (!supabaseKey) {
    throw new Error(
      'Missing required environment variable: ORDER_SUPABASE_SERVICE_ROLE_KEY or ORDER_SUPABASE_ANON_KEY'
    );
  }

  return createClient(
    supabaseUrl,
    supabaseKey
  );
}
