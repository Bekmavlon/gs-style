import clsx from 'clsx';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookmarkPlus, Camera, Check, ImageUp, Loader2, Lock, Send, ShieldCheck, ShoppingBag, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, confirmDialog, Loading, ProgressRing, Segmented, toast } from '@/components/ui';
import { Collage, ItemImage } from '@/components/wardrobe';
import { logWear, saveOutfit } from '@/lib/actions';
import { AiError, aiReady, buildContext, callAi, categoryLabel, getChat, getConsent, itemsByIds, photoForAi, saveChat, setConsent, type AiOutfit, type ChatMsg, type Quota, type RateResult, type ShopResult } from '@/lib/ai';
import { useToday, useWardrobe, type Wardrobe } from '@/lib/data';
import { getMeta, setMeta } from '@/lib/db';
import { uuid } from '@/lib/ids';
import { getForecast } from '@/lib/weather';
import { cityById } from '@/lib/catalog';
import type { Category } from '@/lib/types';

type Tab = 'chat' | 'rate' | 'shop';

const SUGGESTIONS = ['Ertaga ishga nima kiyay?', 'To‘yga boraman — obraz tuzib bering', 'Bugungi ob-havoga mos sport obrazi', 'Uzoq kiymagan kiyimlarimdan obraz', 'Uchrashuvga nima kiysam bo‘ladi?'];

function useAiContext(w: Wardrobe | undefined, today: string) {
  const cityId = w?.settings.city_id ?? 'toshkent';
  const [fc, setFc] = useState<Awaited<ReturnType<typeof getForecast>>['data']>(null);
  useEffect(() => {
    let alive = true;
    void getForecast(cityById(cityId)).then((r) => alive && setFc(r.data));
    return () => {
      alive = false;
    };
  }, [cityId]);
  return useMemo(() => (w ? buildContext(w, today, fc) : null), [w, today, fc]);
}

function errText(e: unknown) {
  return e instanceof AiError ? e.message : 'Kutilmagan xato. Qayta urinib ko‘ring.';
}

export default function StylistPage() {
  const w = useWardrobe();
  const today = useToday(w?.settings.timezone);
  const consent = useLiveQuery(getConsent, []);
  const quota = useLiveQuery(() => getMeta<Quota | null>('ai_quota', null), []);
  const [ready, setReady] = useState<'ok' | 'setup' | 'auth' | null>(null);
  const [tab, setTab] = useState<Tab>('chat');
  const ctx = useAiContext(w, today);

  useEffect(() => {
    void aiReady().then(setReady);
  }, []);

  if (!w || consent === undefined || ready === null) return <Loading />;
  const left = quota && quota.day === today ? Math.max(0, quota.limit - quota.used) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="h-title flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-accent" /> Stilist
          </h1>
          <p className="text-sm text-muted">AI yordamchi{left !== null ? ` · bugun yana ${left} ta so‘rov` : ''}</p>
        </div>
      </div>

      {!consent ? (
        <ConsentCard />
      ) : ready !== 'ok' ? (
        <AccountCard kind={ready} onReady={() => setReady('ok')} />
      ) : (
        <>
          <Segmented<Tab>
            className="w-full [&>button]:flex-1"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'chat', label: 'Suhbat' },
              { value: 'rate', label: 'Obrazga baho' },
              { value: 'shop', label: 'Xarid' }
            ]}
          />
          {w.items.filter((i) => !i.archived).length === 0 && tab !== 'rate' && (
            <div className="card flex items-start gap-3 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <span>
                Garderobingiz bo‘sh — stilist sizning kiyimlaringizdan obraz tuzadi. Avval{' '}
                <Link to="/qoshish" className="text-accent underline">
                  kiyim qo‘shing
                </Link>
                .
              </span>
            </div>
          )}
          {ctx && tab === 'chat' && <Chat w={w} ctx={ctx} today={today} />}
          {ctx && tab === 'rate' && <Rate w={w} ctx={ctx} today={today} />}
          {ctx && tab === 'shop' && <Shop w={w} ctx={ctx} today={today} />}
        </>
      )}
    </div>
  );
}

function ConsentCard() {
  const [adult, setAdult] = useState(false);
  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="h-5 w-5 text-accent" /> AI stilist qanday ishlaydi
      </div>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
        <li>Savolingiz, garderobingiz ro‘yxati (nomi, turi, rangi, necha marta kiyilgani), shahar ob-havosi va profildagi jins/yosh/bo‘y/vazn Google Gemini AI xizmatiga yuboriladi. Ism va e-pochta yuborilmaydi, kiyim rasmlari yuborilmaydi.</li>
        <li>“Obrazga baho”da siz tanlagan rasm ham yuboriladi. Rasm ilovada saqlanmaydi.</li>
        <li>Bepul tarifda Google yuborilgan matn va rasmlardan o‘z xizmatlarini yaxshilash uchun foydalanadi, ularni Google xodimlari ko‘rib chiqishi mumkin. Shaxsiy yoki maxfiy ma’lumot yubormang; baho uchun yuzingiz ko‘rinmaydigan (bo‘yindan pastini) rasm tanlang.</li>
        <li>AI xato qilishi mumkin; tavsiyalar — faqat maslahat.</li>
      </ul>
      <label className="flex items-center gap-2.5 rounded-xl border border-line p-3 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
        Men 18 yoshdan kattaman
      </label>
      <button className="btn-primary w-full" disabled={!adult} onClick={() => void setConsent(true)}>
        <Check className="h-4 w-4" /> Tushundim, roziman
      </button>
      <p className="text-center text-xs text-muted">
        AI stilist faqat 18 yoshdan kattalar uchun.{' '}
        <a href="./maxfiylik.html#ai" target="_blank" rel="noreferrer" className="underline">
          Batafsil
        </a>
      </p>
    </div>
  );
}

function AccountCard({ kind }: { kind: 'setup' | 'auth' | null; onReady?: () => void }) {
  return (
    <div className="card space-y-3 text-center">
      <Lock className="mx-auto h-7 w-7 text-muted" />
      <div className="font-semibold">Hisobga kiring</div>
      <p className="text-sm text-muted">
        {kind === 'setup' ? 'AI stilist server orqali ishlaydi — avval Profil bo‘limida serverni ulang.' : 'AI stilistdan foydalanish uchun email va parol bilan kiring. Pochtaga xat kelmaydi.'}
      </p>
      <Link to="/profil#hisob" className="btn-primary w-full">
        Profil → Hisob
      </Link>
    </div>
  );
}

// ---------- Obraz kartasi (AI tavsiyasi) ----------

function OutfitCard({ w, o, today }: { w: Wardrobe; o: AiOutfit; today: string }) {
  const items = itemsByIds(w.items, o.items);
  const [saved, setSaved] = useState(false);
  const nav = useNavigate();
  if (!items.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <Collage items={items} className="aspect-[4/3]" />
      <div className="space-y-2 p-3">
        <div className="font-medium">{o.title}</div>
        {o.why && <p className="text-sm text-muted">{o.why}</p>}
        <div className="flex flex-wrap gap-1.5">
          {items.map((i) => (
            <button key={i.id} className="chip text-xs" onClick={() => nav(`/kiyim/${i.id}`)}>
              {i.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <button
            className="btn-outline flex-1"
            disabled={saved}
            onClick={async () => {
              await saveOutfit({ name: o.title.slice(0, 80) || 'AI obraz', item_ids: items.map((i) => i.id).slice(0, 10), occasion: 'kundalik', seasons: [], notes: o.why.slice(0, 1000) });
              setSaved(true);
              toast.ok('Obraz saqlandi');
            }}
          >
            {saved ? <Check className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />} {saved ? 'Saqlandi' : 'Saqlash'}
          </button>
          <button
            className="btn-primary flex-1"
            onClick={async () => {
              await logWear(today, items.map((i) => i.id), null);
              toast.ok('Bugun kiyildi deb belgilandi');
            }}
          >
            <Check className="h-4 w-4" /> Kiyaman
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Suhbat ----------

type Ctx = NonNullable<ReturnType<typeof useAiContext>>;

function Chat({ w, ctx, today }: { w: Wardrobe; ctx: Ctx; today: string }) {
  const stored = useLiveQuery(getChat, []);
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (msgs === null && stored) setMsgs(stored);
  }, [stored, msgs]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs?.length, busy]);

  const send = async (q: string) => {
    const t = q.trim();
    if (!t || busy || !msgs) return;
    const next: ChatMsg[] = [...msgs, { id: uuid(), role: 'user', text: t.slice(0, 1500), at: new Date().toISOString() }];
    setMsgs(next);
    setText('');
    setErr(null);
    setBusy(true);
    try {
      const history = next.slice(-12).map((m) => ({ role: m.role, text: m.text }));
      const r = await callAi<{ reply: string; outfits: AiOutfit[] }>('chat', ctx, { messages: history }, today);
      const done = [...next, { id: uuid(), role: 'model' as const, text: r.reply, outfits: r.outfits, at: new Date().toISOString() }];
      setMsgs(done);
      await saveChat(done);
    } catch (e) {
      setErr(errText(e));
      await saveChat(next);
    } finally {
      setBusy(false);
    }
  };

  if (!msgs) return <Loading />;
  return (
    <div className="space-y-3">
      {msgs.length === 0 && (
        <div className="card space-y-3">
          <p className="text-sm text-muted">Stilistdan so‘rang — u garderobingiz, ob-havo va tadbirni hisobga olib, aynan sizning kiyimlaringizdan obraz tuzadi.</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip text-left" onClick={() => void send(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      {msgs.map((m) =>
        m.role === 'user' ? (
          <div key={m.id} className="flex justify-end">
            <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-accent-fg">{m.text}</div>
          </div>
        ) : (
          <div key={m.id} className="space-y-2">
            <div className="flex gap-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface2">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
              </span>
              <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-tl-md border border-line bg-surface px-3.5 py-2 text-sm">{m.text}</div>
            </div>
            {!!m.outfits?.length && (
              <div className="grid gap-3 pl-9 sm:grid-cols-2">
                {m.outfits.map((o, i) => (
                  <OutfitCard key={i} w={w} o={o} today={today} />
                ))}
              </div>
            )}
          </div>
        )
      )}
      {busy && (
        <div className="flex items-center gap-2 pl-1 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Stilist o‘ylayapti…
        </div>
      )}
      {err && (
        <div className="flex items-start gap-2 rounded-xl border border-bad/30 bg-bad/5 p-3 text-sm text-bad">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {err}
        </div>
      )}
      <div ref={endRef} />
      <form
        className="sticky bottom-24 flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm lg:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <textarea
          className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
          rows={1}
          maxLength={1500}
          placeholder="Masalan: shanba kuni tug‘ilgan kunga boraman…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
        />
        <button type="submit" className="btn-primary h-10 w-10 shrink-0 p-0" aria-label="Yuborish" disabled={busy || !text.trim()}>
          <Send className="h-4 w-4" />
        </button>
      </form>
      {msgs.length > 0 && (
        <button
          className="mx-auto flex items-center gap-1.5 text-xs text-muted"
          onClick={async () => {
            if (await confirmDialog({ title: 'Suhbatni tozalash?', message: 'Suhbat tarixi shu qurilmadan o‘chiriladi.', confirmText: 'Tozalash', danger: true })) {
              setMsgs([]);
              await saveChat([]);
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Suhbatni tozalash
        </button>
      )}
    </div>
  );
}

// ---------- Obrazga baho ----------

function Rate({ w, ctx, today }: { w: Wardrobe; ctx: Ctx; today: string }) {
  const [photo, setPhoto] = useState<{ mime: string; data: string; preview: string } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<RateResult | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    setRes(null);
    try {
      setPhoto(await photoForAi(f));
    } catch {
      setErr('Rasmni ochib bo‘lmadi');
    }
  };
  const run = async () => {
    if (!photo) return;
    setBusy(true);
    setErr(null);
    try {
      setRes(await callAi<RateResult>('rate', ctx, { image: { mime: photo.mime, data: photo.data }, note: note.trim() || undefined }, today));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <input ref={camRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      <input ref={galRef} type="file" accept="image/*" className="hidden" data-testid="rate-file" onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      {!photo ? (
        <div className="card space-y-3 text-center">
          <Camera className="mx-auto h-8 w-8 text-muted" />
          <p className="text-sm text-muted">Kiyingan holda ko‘zgu oldida rasmga tushing — stilist obrazni baholab, maslahat beradi. Yuzingiz tushmasin (bo‘yindan pastini oling). Rasm ilovada saqlanmaydi.</p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => camRef.current?.click()}>
              <Camera className="h-4 w-4" /> Kamera
            </button>
            <button className="btn-outline flex-1" onClick={() => galRef.current?.click()}>
              <ImageUp className="h-4 w-4" /> Galereya
            </button>
          </div>
        </div>
      ) : (
        <div className="card space-y-3">
          <div className="relative mx-auto w-full max-w-xs overflow-hidden rounded-xl bg-surface2">
            <img src={photo.preview} alt="Obraz" className="max-h-96 w-full object-contain" />
            <button className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white" aria-label="Rasmni olib tashlash" onClick={() => (setPhoto(null), setRes(null))}>
              <X className="h-4 w-4" />
            </button>
          </div>
          {!res && (
            <>
              <input className="input" maxLength={300} placeholder="Izoh (ixtiyoriy): masalan, ish uchrashuviga" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn-primary w-full" disabled={busy} onClick={() => void run()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {busy ? 'Baholanmoqda…' : 'Baholash'}
              </button>
            </>
          )}
        </div>
      )}
      {err && <div className="rounded-xl border border-bad/30 bg-bad/5 p-3 text-sm text-bad">{err}</div>}
      {res && (
        <div className="card space-y-4">
          <div className="flex items-center gap-4">
            <ProgressRing value={res.score * 10} size={92} stroke={8} label={<span className="text-2xl font-semibold">{res.score}</span>} sub="/ 10" />
            <p className="flex-1 text-sm">{res.summary}</p>
          </div>
          {res.good.length > 0 && (
            <div>
              <div className="section-title mb-1.5">Yaxshi tomonlari</div>
              <ul className="space-y-1 text-sm">
                {res.good.map((g, i) => (
                  <li key={i} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> {g}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {res.improve.length > 0 && (
            <div>
              <div className="section-title mb-1.5">Yaxshilash mumkin</div>
              <ul className="space-y-1 text-sm">
                {res.improve.map((g, i) => (
                  <li key={i} className="flex gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> {g}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {res.swap.length > 0 && (
            <div>
              <div className="section-title mb-1.5">Garderobingizdan almashtirish</div>
              <div className="space-y-2">
                {res.swap.map((s, i) => (
                  <ItemsTip key={i} w={w} ids={s.items} text={s.why} />
                ))}
              </div>
            </div>
          )}
          <button className="btn-outline w-full" onClick={() => (setPhoto(null), setRes(null), setNote(''))}>
            Boshqa rasm
          </button>
        </div>
      )}
    </div>
  );
}

function ItemsTip({ w, ids, text }: { w: Wardrobe; ids: string[]; text: string }) {
  const items = itemsByIds(w.items, ids);
  const nav = useNavigate();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line p-2">
      <div className="flex shrink-0 -space-x-3">
        {items.slice(0, 3).map((i) => (
          <button key={i.id} onClick={() => nav(`/kiyim/${i.id}`)} className="photo-bg h-14 w-14 overflow-hidden rounded-lg border-2 border-surface">
            <ItemImage item={i} />
          </button>
        ))}
      </div>
      <div className="min-w-0 text-sm">
        <div className="truncate font-medium">{items.map((i) => i.name).join(', ')}</div>
        <div className="text-muted">{text}</div>
      </div>
    </div>
  );
}

// ---------- Xarid ----------

function Shop({ w, ctx, today }: { w: Wardrobe; ctx: Ctx; today: string }) {
  const cached = useLiveQuery(() => getMeta<ShopResult | null>('ai_shop', null), []);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const res = cached ?? null;
  const pr = (p: number) => (p === 1 ? <Badge tone="accent">Muhim</Badge> : p === 2 ? <Badge>Foydali</Badge> : <Badge>Keyinroq</Badge>);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await callAi<ShopResult>('shop', ctx, { note: note.trim() || undefined }, today);
      await setMeta('ai_shop', { ...r, at: today });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <div className="flex items-center gap-2 font-medium">
          <ShoppingBag className="h-5 w-5 text-accent" /> Nima sotib olish kerak?
        </div>
        <p className="text-sm text-muted">Stilist garderobingizni tahlil qilib, qaysi kiyimlar yetishmayotganini va kam kiyiladiganlarini qanday ishlatishni aytadi.</p>
        <input className="input" maxLength={300} placeholder="Izoh (ixtiyoriy): masalan, ish uchun, qishga tayyorgarlik" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-primary w-full" disabled={busy || w.items.length === 0} onClick={() => void run()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {busy ? 'Tahlil qilinmoqda…' : res ? 'Qayta tahlil qilish' : 'Garderobni tahlil qilish'}
        </button>
      </div>
      {err && <div className="rounded-xl border border-bad/30 bg-bad/5 p-3 text-sm text-bad">{err}</div>}
      {res && (
        <div className="card space-y-4">
          {res.at && <div className="text-xs text-muted">Tahlil: {res.at}</div>}
          <p className="text-sm">{res.summary}</p>
          {res.missing.length > 0 && (
            <div>
              <div className="section-title mb-1.5">Yetishmayotganlar</div>
              <div className="space-y-2">
                {res.missing.map((m, i) => (
                  <div key={i} className="rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{m.name}</span>
                      {pr(m.priority)}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{m.category !== 'boshqa' ? categoryLabel(m.category as Category) : ''}</div>
                    {m.why && <p className="mt-1 text-sm text-muted">{m.why}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {res.underused.length > 0 && (
            <div>
              <div className="section-title mb-1.5">Kam kiyiladiganlar</div>
              <div className="space-y-2">
                {res.underused.map((u, i) => (
                  <ItemsTip key={i} w={w} ids={u.items} text={u.tip} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <p className={clsx('text-center text-xs text-muted')}>AI tavsiyalari — faqat maslahat.</p>
    </div>
  );
}
