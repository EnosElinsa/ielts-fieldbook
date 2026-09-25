import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function supabaseConfigured() {
  return Boolean(url && anonKey);
}

export function getSupabase() {
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured');
  }
  if (!client) client = createClient(url, anonKey);
  return client;
}
