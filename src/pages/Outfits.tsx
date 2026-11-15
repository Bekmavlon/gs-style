import clsx from 'clsx';
import { Check, Heart, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { confirmDialog, EmptyState, Loading, Modal, toast } from '@/components/ui';
import { ChipGroup, Collage, ItemCard } from '@/components/wardrobe';
import { useToday, useWardrobe } from '@/lib/data';
import { CATEGORIES, OCCASIONS, SEASONS, occasionLabel } from '@/lib/catalog';
import { fieldErrors, logWear, outfitSchema, saveOutfit, type OutfitInput } from '@/lib/actions';
import { remove, update } from '@/lib/repo';
import type { Category, ClothingItem, Occasion, Outfit, Season } from '@/lib/types';

export default function OutfitsPage() {
  const w = useWardrobe();
  const today = useToday(w?.settings.timezone);
  const [filter, setFilter] = useState<Occasion | 'all'>('all');
  const [edit, setEdit] = useState<Outfit | 'new' | null>(null);
  if (!w) return <Loading />;
  const byId = new Map(w.items.map((i) => [i.id, i]));
  const list = w.outfits.filter((o) => filter === 'all' || o.occasion === filter);
  const wornCount = (o: Outfit) => w.logs.filter((l) => l.outfit_id === o.id).length;
  const todayLog = w.logs.find((l) => l.date === today);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="h-title">Obrazlar</h1>
          <p className="text-sm text-muted">{w.outfits.length} ta saqlangan obraz</p>
        </div>
        <button className="btn-primary" onClick={() => setEdit('new')} disabled={!w.items.length}>
          <Plus className="h-4 w-4" /> Yangi obraz
        </button>
      </div>
      {w.outfits.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Hali obraz yo‘q"
          text={w.items.length ? 'Garderobingizdagi kiyimlardan obraz yig‘ing: masalan, “Ish uchun klassik”. “Bugun” sahifasidagi tavsiyani ham bir bosishda saqlash mumkin.' : 'Avval garderobga kiyim qo‘shing.'}
          action={w.items.length ? <button className="btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" /> Obraz yig‘ish</button> : undefined}
        />
      ) : (
        <>
          <div className="scrollbar-none -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4">
            <button className={clsx('chip', filter === 'all' && 'chip-on')} onClick={() => setFilter('all')}>Hammasi</button>
            {OCCASIONS.filter((o) => w.outfits.some((x) => x.occasion === o.id)).map((o) => (
              <button key={o.id} className={clsx('chip', filter === o.id && 'chip-on')} onClick={() => setFilter(o.id)}>{o.label}</button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((o) => {
              const items = o.item_ids.map((id) => byId.get(id)).filter(Boolean) as ClothingItem[];
              const isToday = todayLog?.outfit_id === o.id;
              return (
                <div key={o.id} className="card p-3">
                  <Collage items={items} />
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{o.name}</div>
                      <div className="text-xs text-muted">{occasionLabel(o.occasion)} · {items.length} ta kiyim · {wornCount(o)} marta kiyilgan</div>
                    </div>
                    <button className="p-1" aria-label="Sevimli" onClick={() => void update('outfits', o.id, { favorite: !o.favorite })}>
                      <Heart className={clsx('h-4 w-4', o.favorite ? 'fill-terra text-terra' : 'text-muted')} />
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
                    <button
                      className={isToday ? 'btn-outline' : 'btn-primary'}
                      onClick={async () => {
                        await logWear(today, isToday ? [] : items.map((i) => i.id), isToday ? null : o.id);
                        toast.ok(isToday ? 'Bekor qilindi' : 'Bugun shu obraz kiyildi');
                      }}
                    >
                      <Check className="h-4 w-4" /> {isToday ? 'Bugun kiyildi' : 'Bugun kiyaman'}
                    </button>
                    <button className="btn-outline px-3" aria-label="Tahrirlash" onClick={() => setEdit(o)}><Pencil className="h-4 w-4" /></button>
                    <button
                      className="btn-outline px-3 text-bad"
                      aria-label="O‘chirish"
                      onClick={async () => {
                        if (await confirmDialog({ title: 'Obrazni o‘chirish', message: `“${o.name}” o‘chiriladi. Kiyimlar garderobda qoladi.`, confirmText: 'O‘chirish', danger: true })) await remove('outfits', o.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {edit && <OutfitBuilder items={w.items.filter((i) => !i.archived)} outfit={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function OutfitBuilder({ items, outfit, onClose }: { items: ClothingItem[]; outfit: Outfit | null; onClose: () => void }) {
  const [v, setV] = useState<OutfitInput>({
    name: outfit?.name ?? '',
    item_ids: outfit?.item_ids ?? [],
    occasion: outfit?.occasion ?? 'kundalik',
    seasons: outfit?.seasons ?? [],
    notes: outfit?.notes ?? ''
  });
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sel = v.item_ids.map((id) => items.find((i) => i.id === id)).filter(Boolean) as ClothingItem[];
  const toggle = (id: string) =>
    setV((p) => {
      if (p.item_ids.includes(id)) return { ...p, item_ids: p.item_ids.filter((x) => x !== id) };
      if (p.item_ids.length >= 10) {
        toast.info('Ko‘pi bilan 10 ta kiyim');
        return p;
      }
      return { ...p, item_ids: [...p.item_ids, id] };
    });
  const save = async () => {
    const r = outfitSchema.safeParse(v);
    if (!r.success) return setErrors(fieldErrors(r.error));
    await saveOutfit(r.data, outfit ?? undefined);
    toast.ok('Obraz saqlandi');
    onClose();
  };
  return (
    <Modal open wide onClose={onClose} title={outfit ? 'Obrazni tahrirlash' : 'Yangi obraz'} footer={<><button className="btn-outline" onClick={onClose}>Bekor qilish</button><button className="btn-primary" onClick={() => void save()}>Saqlash</button></>}>
      <div className="space-y-4">
        <Collage items={sel} className="mx-auto max-w-xs" />
        {errors.item_ids && <p className="text-center text-xs text-bad">{errors.item_ids}</p>}
        <label className="block">
          <span className="label">Nomi</span>
          <input className="input" value={v.name} maxLength={80} placeholder="Masalan: Ish uchun klassik" onChange={(e) => setV({ ...v, name: e.target.value })} />
          {errors.name && <span className="mt-1 block text-xs text-bad">{errors.name}</span>}
        </label>
        <div>
          <span className="label">Qachon uchun</span>
          <ChipGroup options={OCCASIONS} value={[v.occasion]} onChange={([o]) => setV({ ...v, occasion: o as Occasion })} />
        </div>
        <div>
          <span className="label">Mavsum</span>
          <ChipGroup options={SEASONS} value={v.seasons} onChange={(s) => setV({ ...v, seasons: s as Season[] })} multi />
        </div>
        <div>
          <span className="label">Kiyimlarni tanlang ({v.item_ids.length}/10)</span>
          <div className="scrollbar-none mb-2 flex gap-1.5 overflow-x-auto">
            <button className={clsx('chip', cat === 'all' && 'chip-on')} onClick={() => setCat('all')}>Hammasi</button>
            {CATEGORIES.filter((c) => items.some((i) => i.category === c.id)).map((c) => (
              <button key={c.id} className={clsx('chip', cat === c.id && 'chip-on')} onClick={() => setCat(c.id)}>{c.label}</button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items.filter((i) => cat === 'all' || i.category === cat).map((i) => (
              <ItemCard key={i.id} item={i} selected={v.item_ids.includes(i.id)} onClick={() => toggle(i.id)} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
