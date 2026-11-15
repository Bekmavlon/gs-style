import { ChevronDown, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { CATEGORIES, COLORS, OCCASIONS, SEASONS, WARMTH, defaultSeasons, defaultWarmth } from '@/lib/catalog';
import { itemSchema, fieldErrors, type ItemInput } from '@/lib/actions';
import { NumberInput } from '@/components/ui';
import { ChipGroup } from './wardrobe';
import type { Category, Occasion, Season, Warmth } from '@/lib/types';

export function autoName(subtype: string, colors: string[]): string {
  const c = COLORS.find((x) => x.id === colors[0]);
  if (!subtype || subtype === 'Boshqa') return c ? `${c.label} kiyim` : 'Yangi kiyim';
  return c ? `${c.label} ${subtype.charAt(0).toLowerCase()}${subtype.slice(1)}` : subtype;
}

export function emptyInput(detectedColors: string[] = [], last?: Partial<ItemInput>): ItemInput {
  const category = (last?.category ?? 'ustki') as Category;
  const subtype = last?.subtype ?? CATEGORIES.find((c) => c.id === category)!.types[0];
  const warmth = defaultWarmth(subtype);
  return {
    name: autoName(subtype, detectedColors),
    category,
    subtype,
    colors: detectedColors,
    seasons: defaultSeasons(warmth),
    occasions: ['kundalik'],
    warmth,
    brand: '',
    size: '',
    price: null,
    purchased_on: null,
    notes: '',
    favorite: false
  };
}

/** Kiyim formasi — qo'shishda ham, tahrirlashda ham */
export function ItemForm({ initial, autoColors = [], onSubmit, submitLabel, busy }: { initial: ItemInput; autoColors?: string[]; onSubmit: (v: ItemInput) => void | Promise<void>; submitLabel: string; busy?: boolean }) {
  const [v, setV] = useState<ItemInput>(initial);
  const [nameTouched, setNameTouched] = useState(initial.name !== autoName(initial.subtype, initial.colors));
  const [more, setMore] = useState(!!(initial.brand || initial.price || initial.size || initial.notes));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const cat = CATEGORIES.find((c) => c.id === v.category)!;

  const set = (patch: Partial<ItemInput>) =>
    setV((p) => {
      const n = { ...p, ...patch };
      if (!nameTouched && (patch.subtype !== undefined || patch.colors !== undefined)) n.name = autoName(n.subtype, n.colors);
      return n;
    });

  const submit = () => {
    const r = itemSchema.safeParse(v);
    if (!r.success) return setErrors(fieldErrors(r.error));
    setErrors({});
    void onSubmit(r.data);
  };

  return (
    <div className="space-y-5">
      <div>
        <span className="label">Bo‘lim</span>
        <ChipGroup
          options={CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
          value={[v.category]}
          onChange={([c]) => {
            const t = CATEGORIES.find((x) => x.id === c)!.types[0];
            const w = defaultWarmth(t);
            set({ category: c as Category, subtype: t, warmth: w, seasons: defaultSeasons(w) });
          }}
        />
      </div>
      <div>
        <span className="label">Turi</span>
        <ChipGroup
          options={cat.types.map((t) => ({ id: t, label: t }))}
          value={[v.subtype]}
          onChange={([t]) => {
            const w = defaultWarmth(t);
            set({ subtype: t, warmth: w, seasons: defaultSeasons(w) });
          }}
        />
      </div>
      <div>
        <span className="label flex items-center gap-1.5">
          Rang {autoColors.length > 0 && <span className="inline-flex items-center gap-1 text-accent"><Sparkles className="h-3 w-3" /> avtomatik aniqlandi</span>}
        </span>
        <ChipGroup options={COLORS.map((c) => ({ id: c.id, label: c.label, dot: c.hex }))} value={v.colors} onChange={(colors) => set({ colors })} multi max={4} />
        {errors.colors && <p className="mt-1 text-xs text-bad">{errors.colors}</p>}
      </div>
      <label className="block">
        <span className="label">Nomi</span>
        <input
          className="input"
          value={v.name}
          maxLength={80}
          onChange={(e) => {
            setNameTouched(true);
            setV({ ...v, name: e.target.value });
          }}
        />
        {errors.name && <span className="mt-1 block text-xs text-bad">{errors.name}</span>}
      </label>
      <div>
        <span className="label">Mavsum</span>
        <ChipGroup options={SEASONS} value={v.seasons} onChange={(seasons) => set({ seasons: seasons as Season[] })} multi />
      </div>
      <div>
        <span className="label">Qachon kiyiladi</span>
        <ChipGroup options={OCCASIONS} value={v.occasions} onChange={(occasions) => set({ occasions: occasions as Occasion[] })} multi />
      </div>
      <div>
        <span className="label">Issiqligi</span>
        <ChipGroup options={WARMTH.map((w) => ({ id: w.id, label: `${w.label} · ${w.hint}` }))} value={[v.warmth]} onChange={([w]) => set({ warmth: w as Warmth })} />
      </div>
      <button type="button" className="flex items-center gap-1 text-xs font-medium text-muted" onClick={() => setMore((m) => !m)}>
        Qo‘shimcha: brend, o‘lcham, narx <ChevronDown className={`h-3.5 w-3.5 transition ${more ? 'rotate-180' : ''}`} />
      </button>
      {more && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Brend</span>
            <input className="input" value={v.brand} maxLength={60} onChange={(e) => setV({ ...v, brand: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">O‘lcham</span>
            <input className="input" value={v.size} maxLength={20} placeholder="M, 42…" onChange={(e) => setV({ ...v, size: e.target.value })} />
          </label>
          <label className="block">
            <span className="label">Narxi (so‘m)</span>
            <NumberInput value={v.price} onChange={(price) => setV({ ...v, price })} min={0} placeholder="350000" />
            {errors.price && <span className="mt-1 block text-xs text-bad">{errors.price}</span>}
          </label>
          <label className="block">
            <span className="label">Sotib olingan</span>
            <input type="date" className="input" value={v.purchased_on ?? ''} onChange={(e) => setV({ ...v, purchased_on: e.target.value || null })} />
          </label>
          <label className="col-span-2 block">
            <span className="label">Izoh</span>
            <textarea className="input min-h-[64px]" value={v.notes} maxLength={1000} onChange={(e) => setV({ ...v, notes: e.target.value })} />
          </label>
        </div>
      )}
      <button className="btn-primary w-full py-3" onClick={submit} disabled={busy}>
        {submitLabel}
      </button>
    </div>
  );
}
