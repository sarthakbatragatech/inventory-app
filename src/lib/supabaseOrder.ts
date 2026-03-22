import { createClient } from '@supabase/supabase-js';

export const supabaseOrder = createClient(
  process.env.ORDER_SUPABASE_URL!,
  process.env.ORDER_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.ORDER_SUPABASE_ANON_KEY!
);
