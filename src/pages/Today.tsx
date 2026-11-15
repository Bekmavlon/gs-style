import clsx from 'clsx';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookmarkPlus, Check, CloudRain, MapPin, Plus, RefreshCw, Shirt, Shuffle, Thermometer, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, Loading, Modal, toast } from '@/components/ui';
import { ChipGroup, Collage, ItemCard, ItemImage } from '@/components/wardrobe';
import { useToday, useWardrobe } from '@/lib/data';
import { CITIES, OCCASIONS, cityById } from '@/lib/catalog';
import { forgottenItems, suggestOutfit, type DayWeather } from '@/lib/suggest';
import { getForecast, WEATHER_TEXT, type Forecast } from '@/lib/weather';
import { logWear, saveOutfit } from '@/lib/actions';
import { saveSettings } from '@/lib/repo';
import { formatUz, formatUzLong, addDays } from '@/lib/dates';
import { getMeta } from '@/lib/db';
import type { ClothingItem, Occasion } from '@/lib/types';

export default function TodayPage() {
  const w = useWardrobe();
  const nav = useNavigate();
  const today = useToday(w?.settings.timezone);
  const [occasion, setOccasion] = useState<Occasion>('kundalik');
  const [variant, setVariant] = useState(0);
  const [fc, setFc] = useState<{ data: Forecast | null; stale: boolean; error?: string } | null>(null);
  const [loadingW, setLoadingW] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const cityId = w?.settings.city_id ?? 'toshkent';
  const cachedKey = useLiveQuery(() => getMeta<Forecast | null>(`weather:${cityId}`, null), [cityId]);

  const load = async (force = false) => {
    setLoadingW(true);
    setFc(await getForecast(cityById(cityId), force));
    setLoadingW(false);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);

  const forecast = fc?.data ?? cachedKey ?? null;
  const day: DayWeather | null = forecast?.days.find((d) => d.date === today) ?? null;
  const sug = useMemo(() => (w ? suggestOutfit({ items: w.items, logs: w.logs.filter((l) => l.date !== today), date: today, weather: day, occasion, variant }) : null), [w, today, day, occasion, variant]);

  if (!w || !sug) return <Loading />;
  const todayLog = w.logs.find((l) => l.date === today);
  const wornToday = (todayLog?.item_ids ?? []).map((id) => w.items.find((i) => i.id === id)).filter(Boolean) as ClothingItem[];
  const forgotten = forgottenItems(w.items, w.logs, today, w.settings.forgotten_days).slice(0, 10);
  const tomorrow = forecast?.days.find((d) => d.date === addDays(today, 1));
  const active = w.items.filter((i) => !i.archived);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-sm text-muted">{formatUzLong(today)}</p>
        <h1 className="h-title">Bugun nima kiyamiz?</h1>
      </div>

      {/* Ob-havo */}
      <div className="card flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          {day && day.precipProb >= 50 ? <CloudRain className="h-7 w-7" /> : <Thermometer className="h-7 w-7" />}
        </div>
        <div className="min-w-0 flex-1">
          <button className="flex items-center gap-1 text-xs text-muted" onClick={() => setCityOpen(true)}>
            <MapPin className="h-3.5 w-3.5" /> {cityById(cityId).label}
          </button>
          {forecast && day ? (
            <>
              <div className="text-xl font-semibold tabular-nums">
                {forecast.current ? `${Math.round(forecast.current.temp)}°C` : `${Math.round(day.tMax)}°C`}
                <span className="ml-2 text-sm font-normal text-muted">{WEATHER_TEXT[forecast.current?.code ?? day.code] ?? ''}</span>
              </div>
              <div className="text-xs text-muted">
                Bugun {Math.round(day.tMin)}…{Math.round(day.tMax)}°C · yog‘ingarchilik {day.precipProb}%{tomorrow ? ` · ertaga ${Math.round(tomorrow.tMin)}…${Math.round(tomorrow.tMax)}°C` : ''}
              </div>
              {fc?.stale && <div className="text-[11px] text-warn">Oxirgi ma’lumot ({formatUz(forecast.fetchedAt.slice(0, 10))}) — {fc.error}</div>}
            </>
          ) : (
            <div className="text-sm text-muted">{loadingW ? 'Ob-havo yuklanmoqda…' : (typeof navigator !== 'undefined' && !navigator.onLine ? 'Internet yo‘q' : 'Ob-havo xizmati javob bermadi') + ' — tavsiya mavsumga qarab beriladi'}</div>
          )}
        </div>
        <button className="btn-ghost p-2" onClick={() => void load(true)} aria-label="Yangilash" disabled={loadingW}>
          <RefreshCw className={clsx('h-4 w-4', loadingW && 'animate-spin')} />
        </button>
      </div>

      {/* Tavsiya */}
      {active.length === 0 ? (
        <EmptyState icon={Shirt} title="Tavsiya uchun kiyim kerak" text="Garderobga kamida ustki, pastki va oyoq kiyim qo‘shing." action={<Link to="/qoshish" className="btn-primary"><Plus className="h-4 w-4" /> Kiyim qo‘shish</Link>} />
      ) : (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Bugungi tavsiya</h2>
            <span className="text-xs text-muted">{sug.needs.label}</span>
          </div>
          <div className="scrollbar-none -mx-4 overflow-x-auto px-4">
            <ChipGroup options={OCCASIONS} value={[occasion]} onChange={([o]) => { setOccasion(o as Occasion); setVariant(0); }} />
          </div>
          {sug.items.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
              <Collage items={sug.items} />
              <div className="space-y-2">
                {sug.items.map((it) => (
                  <button key={it.id} className="flex w-full items-center gap-3 rounded-xl border border-line p-2 text-left hover:bg-surface2" onClick={() => nav(`/kiyim/${it.id}`)}>
                    <ItemImage item={it} className="h-12 w-12 shrink-0 rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{it.name}</span>
                      <span className="block text-xs text-muted">{it.subtype}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <ul className="space-y-1 text-xs text-muted">
            {sug.reasons.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
          {sug.missing.length > 0 && (
            <p className="rounded-xl bg-warn/10 p-3 text-xs text-warn">
              To‘liq obraz uchun garderobga qo‘shing: {sug.missing.join(', ')}. <Link to="/qoshish" className="underline">Qo‘shish</Link>
            </p>
          )}
          {sug.items.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <button className="btn-outline px-2" onClick={() => setVariant((v) => v + 1)}><Shuffle className="h-4 w-4" /> Boshqa</button>
              <button
                className="btn-outline px-2"
                onClick={async () => {
                  await saveOutfit({ name: `${OCCASIONS.find((o) => o.id === occasion)?.label} obraz · ${formatUz(today)}`, item_ids: sug.items.map((i) => i.id), occasion, seasons: [sug.season], notes: '' });
                  toast.ok('Obrazlarga saqlandi');
                }}
              >
                <BookmarkPlus className="h-4 w-4" /> Saqlash
              </button>
              <button
                className="btn-primary px-2"
                onClick={async () => {
                  await logWear(today, sug.items.map((i) => i.id), null);
                  toast.ok('Bugungi obraz belgilandi');
                }}
              >
                <Check className="h-4 w-4" /> Kiyaman
              </button>
            </div>
          )}
          <p className="text-[11px] text-muted">Tavsiya ob-havo, mavsum, tadbir turi, rang uyg‘unligi va qaysi kiyim qachon kiyilganiga qarab tuziladi.</p>
        </div>
      )}

      {/* Bugun kiyganlarim */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Bugun kiyganlarim</h2>
          <button className="text-xs font-medium text-accent" onClick={() => setPickOpen(true)}>{wornToday.length ? 'O‘zgartirish' : 'Belgilash'}</button>
        </div>
        {wornToday.length ? (
          <div className="scrollbar-none flex gap-2 overflow-x-auto">
            {wornToday.map((it) => (
              <div key={it.id} className="relative w-20 shrink-0">
                <ItemImage item={it} className="aspect-square w-20 rounded-xl" />
                <button className="absolute -right-1 -top-1 rounded-full bg-surface p-0.5 shadow" aria-label="Olib tashlash" onClick={() => void logWear(today, todayLog!.item_ids.filter((x) => x !== it.id), todayLog!.outfit_id)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Hali belgilanmagan. Kiyganlaringizni belgilasangiz, statistika va tavsiyalar aniqroq bo‘ladi.</p>
        )}
      </div>

      {/* Eslang */}
      {forgotten.length > 0 && (
        <div className="card">
          <h2 className="section-title">Eslang: uzoq kiyilmaganlar</h2>
          <p className="mb-3 text-xs text-muted">{w.settings.forgotten_days} kundan beri kiyilmagan kiyimlar</p>
          <div className="scrollbar-none flex gap-3 overflow-x-auto">
            {forgotten.map(({ item, since }) => (
              <button key={item.id} className="w-24 shrink-0 text-left" onClick={() => nav(`/kiyim/${item.id}`)}>
                <ItemImage item={item} className="aspect-[3/4] w-24 rounded-xl" />
                <div className="mt-1 truncate text-xs">{item.name}</div>
                <div className="text-[11px] text-muted">{since === null ? 'hech kiyilmagan' : `${since} kun`}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <WearPicker open={pickOpen} onClose={() => setPickOpen(false)} items={active} initial={todayLog?.item_ids ?? []} onSave={async (ids) => { await logWear(today, ids, null); setPickOpen(false); toast.ok('Saqlandi'); }} />
      <Modal open={cityOpen} onClose={() => setCityOpen(false)} title="Shahar">
        <div className="grid grid-cols-2 gap-2">
          {CITIES.map((c) => (
            <button key={c.id} className={clsx('btn-outline justify-start', c.id === cityId && 'border-accent text-accent')} onClick={async () => { await saveSettings({ city_id: c.id }); setCityOpen(false); }}>
              {c.label}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

export function WearPicker({ open, onClose, items, initial, onSave, title = 'Bugun nimalarni kiydingiz?' }: { open: boolean; onClose: () => void; items: ClothingItem[]; initial: string[]; onSave: (ids: string[]) => void; title?: string }) {
  const [sel, setSel] = useState<string[]>(initial);
  useEffect(() => {
    if (open) setSel(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={title} wide footer={<><button className="btn-outline" onClick={onClose}>Bekor qilish</button><button className="btn-primary" onClick={() => onSave(sel)}>Saqlash ({sel.length})</button></>}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((it) => (
          <ItemCard key={it.id} item={it} selected={sel.includes(it.id)} onClick={() => setSel((s) => (s.includes(it.id) ? s.filter((x) => x !== it.id) : [...s, it.id]))} />
        ))}
      </div>
    </Modal>
  );
}
