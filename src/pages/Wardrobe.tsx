import clsx from 'clsx';
import { Archive, Heart, Plus, Search, SlidersHorizontal, Shirt, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, Loading } from '@/components/ui';
import { ChipGroup, ItemCard } from '@/components/wardrobe';
import { useWardrobe } from '@/lib/data';
import { CATEGORIES, COLORS, SEASONS } from '@/lib/catalog';
import type { Category, Season } from '@/lib/types';

type Sort = 'yangi' | 'kop' | 'kam' | 'nom';

export default function WardrobePage() {
  const w = useWardrobe();
  const nav = useNavigate();
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [q, setQ] = useState('');
  const [fav, setFav] = useState(false);
  const [archived, setArchived] = useState(false);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>('yangi');
  const [showFilters, setShowFilters] = useState(false);

  const wearCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of w?.logs ?? []) for (const id of l.item_ids) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [w?.logs]);

  if (!w) return <Loading />;
  const base = w.items.filter((i) => i.archived === archived);
  const counts = new Map<string, number>();
  for (const i of base) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
  const s = q.trim().toLowerCase();
  const list = base
    .filter((i) => cat === 'all' || i.category === cat)
    .filter((i) => !fav || i.favorite)
    .filter((i) => !seasons.length || i.seasons.some((x) => seasons.includes(x)))
    .filter((i) => !colors.length || i.colors.some((x) => colors.includes(x)))
    .filter((i) => !s || [i.name, i.subtype, i.brand, i.notes].join(' ').toLowerCase().includes(s))
    .sort((a, b) =>
      sort === 'nom'
        ? a.name.localeCompare(b.name)
        : sort === 'kop'
          ? (wearCount.get(b.id) ?? 0) - (wearCount.get(a.id) ?? 0)
          : sort === 'kam'
            ? (wearCount.get(a.id) ?? 0) - (wearCount.get(b.id) ?? 0)
            : b.created_at.localeCompare(a.created_at)
    );
  const activeFilters = seasons.length + colors.length + (sort !== 'yangi' ? 1 : 0);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="h-title">{archived ? 'Arxiv' : 'Garderob'}</h1>
          <p className="text-sm text-muted">{base.length} ta kiyim</p>
        </div>
        <Link to="/qoshish" className="btn-primary hidden sm:inline-flex lg:hidden">
          <Plus className="h-4 w-4" /> Qo‘shish
        </Link>
      </div>

      {w.items.length === 0 ? (
        <EmptyState
          icon={Shirt}
          title="Garderobingiz hozircha bo‘sh"
          text="Kiyimlaringizni suratga oling yoki galereyadan tanlang — bir vaqtda 20 tagacha. Rangi avtomatik aniqlanadi."
          action={
            <Link to="/qoshish" className="btn-primary">
              <Plus className="h-4 w-4" /> Birinchi kiyimni qo‘shish
            </Link>
          }
        />
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted" />
              <input className="input pl-9" placeholder="Qidirish: nomi, brendi…" value={q} onChange={(e) => setQ(e.target.value)} />
              {q && (
                <button className="absolute right-2 top-2 p-1 text-muted" onClick={() => setQ('')} aria-label="Tozalash">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button className={clsx('btn-outline relative px-3', showFilters && 'border-accent')} onClick={() => setShowFilters((x) => !x)} aria-label="Filtrlar">
              <SlidersHorizontal className="h-4 w-4" />
              {activeFilters > 0 && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-accent-fg">{activeFilters}</span>}
            </button>
          </div>

          {showFilters && (
            <div className="card mb-3 space-y-3">
              <div>
                <span className="label">Mavsum</span>
                <ChipGroup options={SEASONS} value={seasons} onChange={(v) => setSeasons(v as Season[])} multi />
              </div>
              <div>
                <span className="label">Rang</span>
                <ChipGroup options={COLORS.map((c) => ({ id: c.id, label: c.label, dot: c.hex }))} value={colors} onChange={setColors} multi />
              </div>
              <div>
                <span className="label">Tartib</span>
                <ChipGroup
                  options={[
                    { id: 'yangi', label: 'Yangi qo‘shilgan' },
                    { id: 'kop', label: 'Ko‘p kiyilgan' },
                    { id: 'kam', label: 'Kam kiyilgan' },
                    { id: 'nom', label: 'Nomi bo‘yicha' }
                  ]}
                  value={[sort]}
                  onChange={([v]) => setSort(v as Sort)}
                />
              </div>
              {activeFilters > 0 && (
                <button className="text-xs font-medium text-accent" onClick={() => { setSeasons([]); setColors([]); setSort('yangi'); }}>
                  Filtrlarni tozalash
                </button>
              )}
            </div>
          )}

          <div className="scrollbar-none -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <button className={clsx('chip', cat === 'all' && !fav && 'chip-on')} onClick={() => { setCat('all'); setFav(false); }}>
              Hammasi · {base.length}
            </button>
            <button className={clsx('chip', fav && 'chip-on')} onClick={() => setFav((f) => !f)}>
              <Heart className="h-3.5 w-3.5" /> Sevimli
            </button>
            {CATEGORIES.filter((c) => counts.get(c.id)).map((c) => (
              <button key={c.id} className={clsx('chip', cat === c.id && 'chip-on')} onClick={() => setCat(cat === c.id ? 'all' : c.id)}>
                {c.label} · {counts.get(c.id)}
              </button>
            ))}
          </div>

          {list.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">Hech narsa topilmadi</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {list.map((i) => (
                <ItemCard key={i.id} item={i} onClick={() => nav(`/kiyim/${i.id}`)} />
              ))}
            </div>
          )}

          <button className="mt-8 flex items-center gap-1.5 text-xs text-muted" onClick={() => setArchived((a) => !a)}>
            <Archive className="h-3.5 w-3.5" /> {archived ? 'Garderobga qaytish' : `Arxiv (${w.items.filter((i) => i.archived).length})`}
          </button>
        </>
      )}
    </div>
  );
}
