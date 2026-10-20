// lib/db.js — single Supabase service-role client (server-only).
// The service key bypasses RLS; it must never be sent to the browser.

import { createClient } from '@supabase/supabase-js';

let client = null;

export function getServiceClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
