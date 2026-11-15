import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Supabase konfiguratsiyasi: .env (build vaqtida) yoki Sozlamalar sahifasida kiritilgan
// (localStorage). Faqat URL va OCHIQ anon kalit — maxfiy kalitlar hech qachon frontendga tushmaydi.

const LS_KEY = 'md_supabase_config';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function readConfig(): SupabaseConfig | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (envUrl && envKey && !envUrl.includes('xxxxxxxx')) return { url: envUrl, anonKey: envKey };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as SupabaseConfig;
    if (c.url && c.anonKey) return c;
  } catch {
    /* noto'g'ri saqlangan */
  }
  return null;
}

export function configSource(): 'env' | 'runtime' | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (envUrl && !envUrl.includes('xxxxxxxx')) return 'env';
  return readConfig() ? 'runtime' : null;
}

export function saveRuntimeConfig(c: SupabaseConfig | null) {
  if (c) localStorage.setItem(LS_KEY, JSON.stringify({ url: c.url.trim().replace(/\/$/, ''), anonKey: c.anonKey.trim() }));
  else localStorage.removeItem(LS_KEY);
  client = undefined;
}

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const c = readConfig();
  if (!c) {
    client = null;
    return null;
  }
  try {
    new URL(c.url);
    client = createClient(c.url, c.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
    });
  } catch {
    client = null;
  }
  return client;
}

export const isSupabaseConfigured = () => !!getSupabase();
