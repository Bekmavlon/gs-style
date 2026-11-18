import clsx from 'clsx';
import { Cloud, Database, Download, LogIn, LogOut, Palette, RefreshCw, ShieldCheck, Trash2, Upload, UserRound } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { authErrorText, signInGuest } from '@/lib/guest';
import { googleErrorText, startGoogleAuth } from '@/lib/googleAuth';
import { useLiveQuery } from 'dexie-react-hooks';
import { confirmDialog, Loading, NumberInput, Segmented, toast, Toggle } from '@/components/ui';
import { ChipGroup } from '@/components/wardrobe';
import { useSettings, useWardrobe } from '@/lib/data';
import { CITIES } from '@/lib/catalog';
import { saveSettings, getOwnerId } from '@/lib/repo';
import { getSupabase, readConfig, saveRuntimeConfig, configSource } from '@/lib/supabase';
import { pendingCount, signOutAndWipe, syncNow, useSync, wipeLocal } from '@/lib/sync';
import { downloadJson, exportAll, importBackup, readFileAsJson, BackupError } from '@/lib/backup';
import { bgRemovalAvailable, makeThumb } from '@/lib/images';
import { deleteAllRemoteImages } from '@/lib/imageSync';
import { formatDateTimeUz } from '@/lib/dates';
import type { Gender } from '@/lib/types';

function Section({ id, icon: I, title, children }: { id?: string; icon: typeof UserRound; title: string; children: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-20">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><I className="h-4 w-4 text-accent" /> {title}</h2>
      {children}
    </section>
  );
}

export default function ProfilePage() {
  const s = useSettings();
  const w = useWardrobe();
  const loc = useLocation();
  useEffect(() => {
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [loc.hash]);
  if (s.id === 'fallback' || !w) return <Loading />;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="h-title">Profil</h1>
      <ProfileSection />
      <Section icon={Palette} title="Ilova">
        <div className="space-y-3">
          <div>
            <span className="label">Tema</span>
            <Segmented value={s.theme} onChange={(t) => void saveSettings({ theme: t })} options={[{ value: 'light', label: 'Yorug‘' }, { value: 'dark', label: 'Qorong‘i' }, { value: 'system', label: 'Tizim' }]} />
          </div>
          {bgRemovalAvailable() ? (
            <Toggle checked={s.remove_bg} onChange={(v) => void saveSettings({ remove_bg: v })} label="Fonni avtomatik olib tashlash" desc="Kiyim qo‘shishda, telefonning o‘zida" />
          ) : (
            <p className="text-xs text-muted">Fonni olib tashlash Android ilovasida ishlaydi.</p>
          )}
          <div>
            <span className="label">“Eslang” — necha kun kiyilmasa eslatilsin</span>
            <ChipGroup options={[14, 30, 60, 90].map((d) => ({ id: d, label: `${d} kun` }))} value={[s.forgotten_days]} onChange={([d]) => void saveSettings({ forgotten_days: d })} />
          </div>
        </div>
      </Section>
      <AccountSection />
      <DataSection />
      <Section icon={ShieldCheck} title="Ilova haqida">
        <p className="text-sm text-muted">G.S.Style · versiya {__APP_VERSION__} · ma’lumotlar va rasmlar avval telefoningizda saqlanadi.</p>
        <a className="mt-2 inline-block text-sm text-accent underline" href="./maxfiylik.html">Maxfiylik siyosati</a>
      </Section>
    </div>
  );
}

function ProfileSection() {
  const s = useSettings();
  const [v, setV] = useState({ display_name: s.display_name, gender: s.gender, height_cm: s.height_cm, weight_kg: s.weight_kg, age: s.age, city_id: s.city_id });
  return (
    <Section icon={UserRound} title="Shaxsiy ma’lumotlar">
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block">
          <span className="label">Ism</span>
          <input className="input" value={v.display_name} maxLength={80} onChange={(e) => setV({ ...v, display_name: e.target.value })} />
        </label>
        <div className="col-span-2">
          <span className="label">Jins</span>
          <ChipGroup options={[{ id: 'erkak', label: 'Erkak' }, { id: 'ayol', label: 'Ayol' }]} value={v.gender ? [v.gender] : []} onChange={([g]) => setV({ ...v, gender: (g as Gender) ?? null })} />
        </div>
        <label className="block"><span className="label">Bo‘y (sm)</span><NumberInput value={v.height_cm} onChange={(n) => setV({ ...v, height_cm: n })} min={50} max={250} /></label>
        <label className="block"><span className="label">Vazn (kg)</span><NumberInput value={v.weight_kg} onChange={(n) => setV({ ...v, weight_kg: n })} min={20} max={300} /></label>
        <label className="block"><span className="label">Yosh</span><NumberInput value={v.age} onChange={(n) => setV({ ...v, age: n === null ? null : Math.round(n) })} min={5} max={120} /></label>
        <label className="block">
          <span className="label">Shahar (ob-havo uchun)</span>
          <select className="input" value={v.city_id} onChange={(e) => setV({ ...v, city_id: e.target.value })}>
            {CITIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      </div>
      <button className="btn-primary mt-4" onClick={async () => { await saveSettings({ ...v, display_name: v.display_name.trim() }); toast.ok('Saqlandi'); }}>Saqlash</button>
    </Section>
  );
}

function AccountSection() {
  const sync = useSync();
  const settings = useSettings();
  const sb = getSupabase();
  const [, force] = useState(0);
  const session = useLiveQuery(async () => (await sb?.auth.getSession())?.data.session ?? null, [sync.status, sync.lastSyncAt]);
  const [url, setUrl] = useState(readConfig()?.url ?? '');
  const [key, setKey] = useState(readConfig()?.anonKey ?? '');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const sub = sb?.auth.onAuthStateChange(() => force((x) => x + 1));
    return () => sub?.data.subscription.unsubscribe();
  }, [sb]);

  const google = async (link: boolean) => {
    setBusy(true);
    try {
      await startGoogleAuth(link);
    } catch (e) {
      toast.error(googleErrorText(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const auth = async () => {
    if (!sb) return;
    // Telefon klaviaturasi qo'shgan bo'sh joy va katta harflarni tozalaymiz
    const em = email.trim().replace(/\s+/g, '').toLowerCase();
    if (em !== email) setEmail(em);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast.error('Email noto‘g‘ri: masalan, ism@gmail.com');
    if (pw.length < 8) return toast.error('Parol kamida 8 belgi bo‘lsin');
    setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await sb.auth.signInWithPassword({ email: em, password: pw });
        if (error) throw error;
        toast.ok('Hisobga kirildi');
      } else {
        const { data, error } = await sb.auth.signUp({ email: em, password: pw });
        if (error) throw error;
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMode('in');
          throw new Error('User already registered');
        }
        if (!data.session) {
          setMode('in');
          toast.info('Hisob yaratildi. Pochtangizga kelgan tasdiqlash havolasini bosing, so‘ng “Kirish”ni bosing.');
          return;
        }
        toast.ok('Hisob yaratildi');
      }
      setPw('');
      void syncNow();
    } catch (e) {
      toast.error(authErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="hisob" icon={Cloud} title="Hisob va sinxronlash">
      {!sb ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Hozir hamma narsa <b>faqat shu qurilmada</b> saqlanmoqda. Telefon almashtirsangiz ham garderob saqlanib qolishi uchun server (Supabase) ulang — faqat URL va ochiq (anon/publishable) kalit.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Supabase URL</span><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" /></label>
            <label className="block"><span className="label">Ochiq kalit</span><input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sb_publishable_…" /></label>
          </div>
          <button
            className="btn-primary"
            onClick={() => {
              try {
                if (new URL(url.trim()).protocol !== 'https:') throw new Error();
              } catch {
                return toast.error('URL noto‘g‘ri');
              }
              if (key.trim().length < 20) return toast.error('Kalit juda qisqa');
              saveRuntimeConfig({ url, anonKey: key });
              location.reload();
            }}
          >
            Ulash
          </button>
        </div>
      ) : !session ? (
        <div className="space-y-3">
          <div className="space-y-2 rounded-xl border border-accent/30 bg-accent/5 p-3">
            <p className="text-sm">Google hisobingiz bilan kiring — telefon almashtirsangiz ham garderobingiz qaytadi. Xat va SMS kelmaydi.</p>
            <button className="btn-primary w-full" disabled={busy} onClick={() => void google(false)}>
              <GoogleG /> Google bilan kirish
            </button>
            <button
              className="btn-outline w-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await signInGuest();
                  toast.ok('Hisob ochildi');
                } catch (e) {
                  toast.error(authErrorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogIn className="h-4 w-4" /> Emailsiz kirish
            </button>
          </div>
          <div className="text-center text-xs text-muted">yoki email bilan</div>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'in', label: 'Kirish' }, { value: 'up', label: 'Ro‘yxatdan o‘tish' }]} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Email</span><input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="ism@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="block"><span className="label">Parol (kamida 8 belgi)</span><input className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          </div>
          <button className="btn-outline" onClick={() => void auth()} disabled={busy}><LogIn className="h-4 w-4" /> {mode === 'in' ? 'Kirish' : 'Hisob yaratish'}</button>
          <p className="text-xs text-muted">Kirganingizdan so‘ng shu qurilmadagi kiyimlar va rasmlar hisobingizga yuklanadi.</p>
          {configSource() === 'runtime' && <button className="btn-ghost text-xs" onClick={() => { saveRuntimeConfig(null); location.reload(); }}>Server ulanishini olib tashlash</button>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm">
            <div className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-ok" /> {session.user.is_anonymous ? 'Emailsiz hisob' : session.user.email}</div>
            {session.user.is_anonymous && (
              <div className="mt-2 space-y-2 rounded-xl border border-warn/40 bg-warn/5 p-3">
                <p className="text-xs">Bu hisobga parol yo‘q: ilovani o‘chirsangiz yoki telefon almashtirsangiz, unga qayta kirib bo‘lmaydi. Google hisobingizni bog‘lang — garderob o‘z joyida qoladi.</p>
                <button className="btn-primary w-full" disabled={busy} onClick={() => void google(true)}>
                  <GoogleG /> Google hisobini bog‘lash
                </button>
              </div>
            )}
            <div className="mt-1 text-xs text-muted">
              {{ local: 'lokal', idle: 'sinxronlangan', syncing: 'sinxronlanmoqda', offline: 'oflayn', error: 'xato' }[sync.status]}
              {sync.pending ? ` · ${sync.pending} ta navbatda` : ''}
              {sync.lastSyncAt ? ` · oxirgi: ${formatDateTimeUz(sync.lastSyncAt, settings.timezone)}` : ''}
            </div>
          </div>
          {sync.error && <p className="rounded-xl bg-bad/10 p-2 text-xs text-bad">{sync.error}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" onClick={() => void syncNow()}><RefreshCw className={clsx('h-4 w-4', sync.status === 'syncing' && 'animate-spin')} /> Sinxronlash</button>
            <button
              className="btn-outline"
              onClick={async () => {
                const n = await pendingCount();
                if (!(await confirmDialog({ title: 'Hisobdan chiqish', message: session.user.is_anonymous ? 'Bu emailsiz hisob: chiqqaningizdan keyin unga qayta kirib bo‘lmaydi va shu qurilmadagi garderob o‘chiriladi. Avval zaxira nusxani yuklab oling. Baribir chiqasizmi?' : n ? `${n} ta o‘zgarish hali yuborilmagan va yo‘qoladi. Avval “Sinxronlash”ni bosing. Baribir chiqasizmi?` : 'Shu qurilmadagi nusxa o‘chiriladi (serverda saqlanib qoladi).', confirmText: 'Chiqish', danger: n > 0 || !!session.user.is_anonymous }))) return;
                await signOutAndWipe();
                location.reload();
              }}
            >
              <LogOut className="h-4 w-4" /> Chiqish
            </button>
            <button
              className="btn-ghost text-bad"
              onClick={async () => {
                if (!(await confirmDialog({ title: 'Hisobni butunlay o‘chirish', message: 'Hisobingiz, barcha kiyimlar, obrazlar va rasmlar serverdan qaytarib bo‘lmaydigan tarzda o‘chiriladi. Davom etasizmi?', confirmText: 'Ha, o‘chirish', danger: true }))) return;
                try {
                  await deleteAllRemoteImages(session.user.id);
                  const { error } = await sb.rpc('delete_my_account');
                  if (error) throw error;
                  await signOutAndWipe();
                  location.reload();
                } catch (e) {
                  toast.error('O‘chirib bo‘lmadi: ' + (e instanceof Error ? e.message : ''));
                }
              }}
            >
              <Trash2 className="h-4 w-4" /> Hisobni o‘chirish
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [withImages, setWithImages] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <Section icon={Database} title="Zaxira nusxa">
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} /> Rasmlar bilan (fayl kattaroq bo‘ladi)</label>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              downloadJson(await exportAll(withImages), `gsstyle-zaxira-${new Date().toISOString().slice(0, 10)}.json`);
              setBusy(false);
              toast.ok('Zaxira fayli yuklandi');
            }}
          >
            <Download className="h-4 w-4" /> Yuklab olish
          </button>
          <button className="btn-outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Tiklash</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const raw = await readFileAsJson(f);
              if (!(await confirmDialog({ title: 'Zaxiradan tiklash', message: 'Fayldagi ma’lumotlar mavjudlari bilan birlashtiriladi: har yozuvning eng yangi versiyasi qoladi. Hech narsa o‘chirilmaydi.', confirmText: 'Tiklash' }))) return;
              const r = await importBackup(raw, makeThumb);
              toast.ok(`Tiklandi: ${r.added} yangi, ${r.updated} yangilandi, ${r.images} ta rasm`);
            } catch (err) {
              toast.error(err instanceof BackupError ? err.message : 'Faylni o‘qib bo‘lmadi');
            }
          }}
        />
        <button
          className="btn-ghost px-0 text-xs text-bad"
          onClick={async () => {
            const owner = await getOwnerId();
            if (!(await confirmDialog({ title: 'Shu qurilmadagi ma’lumotlarni tozalash', message: owner ? 'Lokal nusxa o‘chiriladi; serverdagi ma’lumotlar saqlanadi.' : 'Hisobga kirmagansiz — garderob BUTUNLAY o‘chadi. Avval zaxira oling!', confirmText: 'Tozalash', danger: true }))) return;
            await getSupabase()?.auth.signOut();
            await wipeLocal();
            location.reload();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Shu qurilmadagi ma’lumotlarni tozalash
        </button>
      </div>
    </Section>
  );
}

export { authErrorText } from '@/lib/guest';

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 rounded-full bg-white p-[2px]" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z" />
    </svg>
  );
}
