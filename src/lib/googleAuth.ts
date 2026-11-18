// Google bilan kirish (Supabase OAuth, PKCE).
// Telefonda: Google sahifasi tizim brauzerida (Custom Tabs) ochiladi, so'ng Supabase
// uz.gsstyle.app://auth-callback?code=... havolasi bilan ilovaga qaytaradi.
// Emailsiz hisob bo'lsa — Google unga "bog'lanadi" (linkIdentity), garderob o'z joyida qoladi.
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { getSupabase } from './supabase';
import { syncNow } from './sync';

export const NATIVE_REDIRECT = 'uz.gsstyle.app://auth-callback';

const redirectTo = () => (Capacitor.isNativePlatform() ? NATIVE_REDIRECT : `${location.origin}${location.pathname}`);

/** Google kirish sahifasini ochadi. link=true — mavjud (emailsiz) hisobga Google'ni bog'laydi. */
export async function startGoogleAuth(link: boolean): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Server ulanmagan');
  const options = { redirectTo: redirectTo(), skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } };
  const { data, error } = link ? await sb.auth.linkIdentity({ provider: 'google', options }) : await sb.auth.signInWithOAuth({ provider: 'google', options });
  if (error) throw error;
  if (!data?.url) throw new Error('Kirish havolasi olinmadi');
  if (Capacitor.isNativePlatform()) await Browser.open({ url: data.url });
  else location.assign(data.url);
}

/** Qaytish havolasini tahlil qilish (sof funksiya) */
export function parseAuthCallback(url: string): { code: string } | { error: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const q = new URLSearchParams(u.search);
  const h = new URLSearchParams(u.hash.replace(/^#/, ''));
  const err = q.get('error_description') ?? h.get('error_description') ?? q.get('error') ?? h.get('error');
  if (err) return { error: err };
  const code = q.get('code');
  return code ? { code } : null;
}

export function googleErrorText(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('already linked') || m.includes('identity_already_exists') || m.includes('already exists')) return 'Bu Google hisobi boshqa hisobga bog‘langan. Profil → “Chiqish”, so‘ng “Google bilan kirish”ni bosing (avval zaxira nusxa oling).';
  if (m.includes('manual linking')) return 'Supabase’da “Allow manual linking” yoqilmagan (Authentication → Sign In / Providers).';
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return 'Supabase’da Google provayderi yoqilmagan (Authentication → Sign In / Providers → Google).';
  if (m.includes('access_denied') || m.includes('access denied')) return 'Google kirishga ruxsat bermadi. Google Cloud’da emailingiz “Test users” ro‘yxatida borligini tekshiring.';
  if (m.includes('code verifier') || m.includes('flow state')) return 'Kirish muddati o‘tib ketdi. Qaytadan “Google bilan kirish”ni bosing.';
  return raw;
}

async function finish(url: string): Promise<{ ok: true } | { ok: false; message: string } | null> {
  const r = parseAuthCallback(url);
  if (!r) return null;
  void Browser.close().catch(() => undefined);
  if ('error' in r) return { ok: false, message: googleErrorText(r.error) };
  const sb = getSupabase();
  if (!sb) return { ok: false, message: 'Server ulanmagan' };
  const { error } = await sb.auth.exchangeCodeForSession(r.code);
  if (error) return { ok: false, message: googleErrorText(error.message) };
  void syncNow();
  return { ok: true };
}

/** Ilova ishga tushganda bir marta chaqiriladi: Google'dan qaytishni tinglaydi */
export function listenAuthRedirects(onResult: (r: { ok: true } | { ok: false; message: string }) => void) {
  if (!Capacitor.isNativePlatform()) return;
  const handle = async (url: string | undefined) => {
    if (!url || !url.startsWith(NATIVE_REDIRECT)) return;
    const r = await finish(url);
    if (r) onResult(r);
  };
  void App.addListener('appUrlOpen', ({ url }) => void handle(url));
  void App.getLaunchUrl()
    .then((l) => handle(l?.url))
    .catch(() => undefined);
}
