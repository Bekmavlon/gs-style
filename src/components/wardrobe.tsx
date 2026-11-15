// Garderobga oid qayta ishlatiladigan komponentlar
import clsx from 'clsx';
import { Heart, Shirt, Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useImageUrl } from '@/lib/data';
import { colorById } from '@/lib/catalog';
import type { ClothingItem } from '@/lib/types';

export function ItemImage({ item, kind = 'thumb', className, contain = true }: { item: ClothingItem | null | undefined; kind?: 'thumb' | 'full'; className?: string; contain?: boolean }) {
  const url = useImageUrl(item, kind);
  return (
    <div className={clsx('photo-bg relative flex items-center justify-center overflow-hidden', className)}>
      {url ? (
        <img src={url} alt={item?.name ?? ''} className={clsx('h-full w-full', contain ? 'object-contain p-[6%]' : 'object-cover')} draggable={false} />
      ) : (
        <Shirt className="h-1/3 w-1/3 text-muted/40" />
      )}
    </div>
  );
}

export function ItemCard({ item, onClick, selected, badge }: { item: ClothingItem; onClick?: () => void; selected?: boolean; badge?: ReactNode }) {
  return (
    <button onClick={onClick} className={clsx('group relative block w-full overflow-hidden rounded-2xl border bg-surface text-left transition', selected ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-muted/40')}>
      <ItemImage item={item} className="aspect-[3/4] w-full" />
      {item.favorite && <Heart className="absolute right-2 top-2 h-4 w-4 fill-terra text-terra" />}
      {selected && (
        <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-fg">
          <Check className="h-4 w-4" />
        </span>
      )}
      {badge && <span className="absolute bottom-[54px] left-2">{badge}</span>}
      <div className="px-2.5 py-2">
        <div className="truncate text-[13px] font-medium">{item.name}</div>
        <div className="mt-0.5 flex items-center gap-1">
          {item.colors.slice(0, 3).map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-full border border-line" style={{ background: colorById(c)?.hex }} />
          ))}
          <span className="truncate text-[11px] text-muted">{item.subtype}</span>
        </div>
      </div>
    </button>
  );
}

/** Obraz kollaji: kiyimlar bitta kartada */
export function Collage({ items, className }: { items: ClothingItem[]; className?: string }) {
  const n = items.length;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  return (
    <div className={clsx('photo-bg grid gap-1 overflow-hidden rounded-2xl p-1', className)} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {items.slice(0, 9).map((it) => (
        <ItemImage key={it.id} item={it} className={clsx('rounded-xl bg-surface', cols === 1 ? 'aspect-[3/4]' : 'aspect-square')} />
      ))}
      {!n && (
        <div className="flex aspect-[3/2] items-center justify-center text-muted/50">
          <Shirt className="h-8 w-8" />
        </div>
      )}
    </div>
  );
}

export function ChipGroup<T extends string | number>({ options, value, onChange, multi, max }: { options: { id: T; label: string; dot?: string }[]; value: T[]; onChange: (v: T[]) => void; multi?: boolean; max?: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            type="button"
            key={String(o.id)}
            className={clsx('chip', on && 'chip-on')}
            onClick={() => {
              if (!multi) return onChange([o.id]);
              if (on) return onChange(value.filter((x) => x !== o.id));
              if (max && value.length >= max) return;
              onChange([...value, o.id]);
            }}
          >
            {o.dot && <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: o.dot }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const fmtSum = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ')} so‘m`);
