// Emailsiz (anonim) kirish va kirish xatolarining o'zbekcha matni.
import { getSupabase } from './supabase';
import { syncNow } from './sync';

/** Email va parolsiz hisob: Supabase anonim foydalanuvchi yaratadi (xat yuborilmaydi). */
export async function signInGuest(): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Server ulanmagan');
  const { error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  void syncNow();
}

/** Supabase xatolarini tushunarli o'zbekchaga o'giradi */
export function authErrorText(e: unknown): string {
  const m = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase();
  if (m.includes('anonymous sign-ins are disabled') || m.includes('anonymous')) return 'Supabase’da emailsiz kirish yoqilmagan: Authentication → Sign In / Providers → “Allow anonymous sign-ins”ni yoqing.';
  if (m.includes('invalid login credentials')) return 'Email yoki parol noto‘g‘ri.';
  if (m.includes('email not confirmed')) return 'Email hali tasdiqlanmagan. Pochtangizdagi (Spam papkasini ham tekshiring) tasdiqlash havolasini bosing.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Bu email bilan hisob allaqachon bor — “Kirish” bo‘limidan kiring.';
  if (m.includes('not authorized')) return 'Server bu manzilga tasdiqlash xati yubora olmadi. Supabase’da “Confirm email”ni o‘chirib, qayta urinib ko‘ring.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Juda ko‘p urinish. Birozdan keyin (taxminan 1 soat) qayta urinib ko‘ring.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'Yangi ro‘yxatdan o‘tish yopilgan. Mavjud hisob bilan kiring.';
  if (m.includes('password')) return 'Parol talabga javob bermadi: kamida 8 belgi, harf va raqam aralash bo‘lsin.';
  if (m.includes('invalid format') || m.includes('validate email')) return 'Email noto‘g‘ri yozilgan.';
  if (m.includes('fetch') || m.includes('network')) return 'Serverga ulanib bo‘lmadi. Internetni tekshiring.';
  return e instanceof Error && e.message ? e.message : 'Xato yuz berdi';
}
