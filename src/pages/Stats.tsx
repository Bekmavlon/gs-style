import { BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, Loading, ProgressBar, Stat } from '@/components/ui';
import { ItemImage, fmtSum } from '@/components/wardrobe';
import { useToday, useWardrobe } from '@/lib/data';
import { CATEGORIES, COLORS } from '@/lib/catalog';
import { costPerWear, wearStats } from '@/lib/suggest';
import { addDays, eachDay, startOfWeek, WEEKDAYS_SHORT_UZ } from '@/lib/dates';

export default function StatsPage() {
  const w = useWardrobe();
  const nav = useNavigate();
  const today = useToday(w?.settings.timezone);
  if (!w) return <Loading />;
  const items = w.items.filter((i) => !i.archived);
  if (!items.length) return <EmptyState icon={BarChart3} title="Statistika uchun kiyim kerak" text="Kiyim qo‘shib, kiyganlaringizni belgilang — bu yerda qaysi kiyim ko‘p va kam kiyilishi ko‘rinadi." />;
  const st = wearStats(w.logs);
  const total = items.reduce((a, i) => a + (i.price ?? 0), 0);
  const priced = items.filter((i) => i.price).length;
  const last30 = new Set(w.logs.filter((l) => l.date > addDays(today, -30) && l.item_ids.length).map((l) => l.date)).size;
  const never = items.filter((i) => !st.count.get(i.id));
  const top = [...items].filter((i) => st.count.get(i.id)).sort((a, b) => (st.count.get(b.id) ?? 0) - (st.count.get(a.id) ?? 0)).slice(0, 5);
  const cpw = items.map((i) => ({ i, c: costPerWear(i, st) })).filter((x) => x.c !== null).sort((a, b) => (a.c as number) - (b.c as number));
  const colorCount = new Map<string, number>();
  for (const i of items) for (const c of i.colors.slice(0, 1)) colorCount.set(c, (colorCount.get(c) ?? 0) + 1);
  const colorRows = [...colorCount.entries()].sort((a, b) => b[1] - a[1]);
  const weeks = 5;
  const start = startOfWeek(addDays(today, -7 * (weeks - 1)));
  const days = eachDay(start, addDays(start, weeks * 7 - 1));
  const logged = new Map(w.logs.map((l) => [l.date, l.item_ids.length]));

  const Mini = ({ id, sub }: { id: string; sub: string }) => {
    const it = items.find((x) => x.id === id)!;
    return (
      <button className="flex w-full items-center gap-3 py-2 text-left" onClick={() => nav(`/kiyim/${it.id}`)}>
        <ItemImage item={it} className="h-11 w-11 shrink-0 rounded-lg" />
        <span className="min-w-0 flex-1 truncate text-sm">{it.name}</span>
        <span className="text-xs text-muted">{sub}</span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="h-title">Statistika</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Kiyimlar" value={items.length} sub={`${w.items.length - items.length} ta arxivda`} />
        <Stat label="Obrazlar" value={w.outfits.length} />
        <Stat label="Belgilangan kunlar" value={`${last30} / 30`} sub="oxirgi 30 kunda" />
        <Stat label="Garderob qiymati" value={priced ? fmtSum(total) : '—'} sub={priced ? `${priced} ta kiyim narxi kiritilgan` : 'narxlar kiritilmagan'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="section-title mb-3">Bo‘limlar</h2>
          <div className="space-y-2.5">
            {CATEGORIES.map((c) => ({ c, n: items.filter((i) => i.category === c.id).length })).filter((x) => x.n).map(({ c, n }) => (
              <div key={c.id}>
                <div className="mb-1 flex justify-between text-sm"><span>{c.label}</span><span className="text-muted">{n}</span></div>
                <ProgressBar value={(n / items.length) * 100} />
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="section-title mb-3">Ranglar (asosiy rang bo‘yicha)</h2>
          <div className="space-y-2">
            {colorRows.map(([id, n]) => {
              const c = COLORS.find((x) => x.id === id);
              return (
                <div key={id} className="flex items-center gap-3 text-sm">
                  <span className="h-4 w-4 shrink-0 rounded-full border border-line" style={{ background: c?.hex }} />
                  <span className="w-28 shrink-0">{c?.label ?? id}</span>
                  <ProgressBar value={(n / items.length) * 100} color={c?.hex} />
                  <span className="w-8 text-right text-muted">{n}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <h2 className="section-title mb-1">Eng ko‘p kiyilganlar</h2>
          {top.length ? top.map((i) => <Mini key={i.id} id={i.id} sub={`${st.count.get(i.id)} marta`} />) : <p className="py-2 text-sm text-muted">Hali kiyilgan kiyim belgilanmagan</p>}
        </div>
        <div className="card">
          <h2 className="section-title mb-1">Hech kiyilmagan · {never.length}</h2>
          {never.slice(0, 5).map((i) => <Mini key={i.id} id={i.id} sub="0 marta" />)}
          {!never.length && <p className="py-2 text-sm text-muted">Hamma kiyim kamida bir marta kiyilgan</p>}
        </div>
        <div className="card lg:col-span-2">
          <h2 className="section-title mb-1">Bir kiyish narxi</h2>
          <p className="mb-2 text-xs text-muted">Narx ÷ kiyilgan marta. Qanchalik past bo‘lsa, xarid shunchalik o‘zini oqlagan.</p>
          {cpw.length ? (
            <div className="grid gap-x-6 sm:grid-cols-2">
              {cpw.slice(0, 6).map(({ i, c }) => <Mini key={i.id} id={i.id} sub={fmtSum(c)} />)}
            </div>
          ) : (
            <p className="text-sm text-muted">Narx kiritilgan va kiyilgan kiyimlar bo‘lganda hisoblanadi</p>
          )}
        </div>
        <div className="card lg:col-span-2">
          <h2 className="section-title mb-3">Oxirgi 5 hafta</h2>
          <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-muted">
            {WEEKDAYS_SHORT_UZ.map((d) => <div key={d}>{d}</div>)}
            {days.map((d) => {
              const n = logged.get(d) ?? 0;
              return (
                <div key={d} title={d} className={`flex aspect-square items-center justify-center rounded-lg text-[11px] ${d > today ? 'opacity-30' : ''} ${n ? 'bg-accent text-accent-fg' : 'bg-surface2'} ${d === today ? 'ring-2 ring-accent/50' : ''}`}>
                  {Number(d.slice(8))}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted">Rangli kunlar — kiyilgan kiyimlar belgilangan kunlar</p>
        </div>
      </div>
    </div>
  );
}
