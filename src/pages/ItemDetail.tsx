import { Archive, ArchiveRestore, ArrowLeft, Check, Heart, Pencil, Trash2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { confirmDialog, EmptyState, Loading, toast } from '@/components/ui';
import { ItemImage, fmtSum } from '@/components/wardrobe';
import { ItemForm } from '@/components/ItemForm';
import { useToday, useWardrobe } from '@/lib/data';
import { categoryLabel, colorById, OCCASIONS, SEASONS, WARMTH } from '@/lib/catalog';
import { costPerWear, wearStats } from '@/lib/suggest';
import { deleteItem, editItem, logWear } from '@/lib/actions';
import { diffDays, formatUz } from '@/lib/dates';
import { db } from '@/lib/db';
import { bgRemovalAvailable, removeBackground, storeImage, extOf } from '@/lib/images';
import { queueImageDelete } from '@/lib/imageSync';
import { getOwnerId, update } from '@/lib/repo';

export default function ItemDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const w = useWardrobe();
  const today = useToday(w?.settings.timezone);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!w) return <Loading />;
  const item = w.items.find((i) => i.id === id);
  if (!item) return <EmptyState title="Kiyim topilmadi" action={<button className="btn-primary" onClick={() => nav('/')}>Garderobga</button>} />;

  const stats = wearStats(w.logs);
  const count = stats.count.get(item.id) ?? 0;
  const last = stats.lastWorn.get(item.id);
  const cpw = costPerWear(item, stats);
  const todayLog = w.logs.find((l) => l.date === today);
  const wornToday = !!todayLog?.item_ids.includes(item.id);
  const inOutfits = w.outfits.filter((o) => o.item_ids.includes(item.id)).length;

  if (editing)
    return (
      <div className="mx-auto max-w-md">
        <button className="btn-ghost -ml-2 mb-3 px-2" onClick={() => setEditing(false)}>
          <ArrowLeft className="h-4 w-4" /> Bekor qilish
        </button>
        <ItemForm
          initial={{
            name: item.name, category: item.category, subtype: item.subtype, colors: item.colors, seasons: item.seasons, occasions: item.occasions,
            warmth: item.warmth, brand: item.brand, size: item.size, price: item.price, purchased_on: item.purchased_on, notes: item.notes, favorite: item.favorite
          }}
          submitLabel="Saqlash"
          onSubmit={async (v) => {
            await editItem(item.id, v);
            toast.ok('Saqlandi');
            setEditing(false);
          }}
        />
      </div>
    );

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex justify-between gap-3 py-2 text-sm">
      <span className="text-muted">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <button className="btn-ghost -ml-2 mb-3 px-2" onClick={() => nav(-1)}>
        <ArrowLeft className="h-4 w-4" /> Orqaga
      </button>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <ItemImage item={item} kind="full" className="aspect-[3/4] w-full rounded-3xl" />
          {bgRemovalAvailable() && !item.bg_removed && (
            <button
              className="btn-outline mt-3 w-full"
              disabled={busy}
              onClick={async () => {
                const img = item.image_id ? await db.images.get(item.image_id) : null;
                if (!img) return toast.error('Rasm topilmadi');
                setBusy(true);
                const nb = await removeBackground(img.blob);
                if (!nb) {
                  setBusy(false);
                  return toast.error('Fonni olib tashlab bo‘lmadi');
                }
                const stored = await storeImage(nb, true);
                await queueImageDelete(await getOwnerId(), img.id, item.image_ext ?? 'webp');
                await update('items', item.id, { image_id: stored.id, image_ext: extOf(stored.mime), bg_removed: true });
                setBusy(false);
                toast.ok('Fon olib tashlandi');
              }}
            >
              <Wand2 className="h-4 w-4" /> {busy ? 'Ishlanmoqda…' : 'Fonni olib tashlash'}
            </button>
          )}
        </div>
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold">{item.name}</h1>
              <p className="text-sm text-muted">{categoryLabel(item.category)} · {item.subtype}</p>
            </div>
            <button className="btn-ghost p-2" aria-label="Sevimli" onClick={() => void editItem(item.id, { favorite: !item.favorite })}>
              <Heart className={clsx('h-5 w-5', item.favorite ? 'fill-terra text-terra' : 'text-muted')} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="card p-3"><div className="text-lg font-semibold tabular-nums">{count}</div><div className="text-[11px] text-muted">marta kiyilgan</div></div>
            <div className="card p-3"><div className="text-sm font-semibold">{last ? (diffDays(last, today) === 0 ? 'bugun' : `${diffDays(last, today)} kun oldin`) : '—'}</div><div className="text-[11px] text-muted">oxirgi marta</div></div>
            <div className="card p-3"><div className="text-sm font-semibold">{cpw ? fmtSum(cpw) : '—'}</div><div className="text-[11px] text-muted">bir kiyish narxi</div></div>
          </div>

          <button
            className={clsx('mt-3 w-full', wornToday ? 'btn-outline' : 'btn-primary')}
            onClick={async () => {
              const ids = todayLog?.item_ids ?? [];
              await logWear(today, wornToday ? ids.filter((x) => x !== item.id) : [...ids, item.id], todayLog?.outfit_id ?? null);
              toast.ok(wornToday ? 'Bugungi ro‘yxatdan olindi' : 'Bugun kiyildi deb belgilandi');
            }}
          >
            <Check className="h-4 w-4" /> {wornToday ? 'Bugun kiyildi ✓' : 'Bugun kiydim'}
          </button>

          <div className="card mt-4 divide-y divide-line py-1">
            <Row k="Rang" v={<span className="flex flex-wrap justify-end gap-1.5">{item.colors.map((c) => <span key={c} className="flex items-center gap-1"><span className="h-3 w-3 rounded-full border border-line" style={{ background: colorById(c)?.hex }} />{colorById(c)?.label}</span>)}</span>} />
            <Row k="Mavsum" v={item.seasons.map((s) => SEASONS.find((x) => x.id === s)?.label).join(', ') || '—'} />
            <Row k="Qachon" v={item.occasions.map((s) => OCCASIONS.find((x) => x.id === s)?.label).join(', ') || '—'} />
            <Row k="Issiqligi" v={WARMTH.find((x) => x.id === item.warmth)?.label} />
            {item.brand && <Row k="Brend" v={item.brand} />}
            {item.size && <Row k="O‘lcham" v={item.size} />}
            {item.price != null && <Row k="Narxi" v={fmtSum(item.price)} />}
            {item.purchased_on && <Row k="Sotib olingan" v={formatUz(item.purchased_on, true)} />}
            <Row k="Obrazlarda" v={`${inOutfits} ta`} />
            <Row k="Qo‘shilgan" v={formatUz(item.created_at.slice(0, 10), true)} />
          </div>
          {item.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{item.notes}</p>}

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button className="btn-outline px-2" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Tahrir</button>
            <button className="btn-outline px-2" onClick={async () => { await editItem(item.id, { archived: !item.archived }); toast.ok(item.archived ? 'Garderobga qaytarildi' : 'Arxivga olindi'); }}>
              {item.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {item.archived ? 'Qaytarish' : 'Arxiv'}
            </button>
            <button
              className="btn-outline px-2 text-bad"
              onClick={async () => {
                if (!(await confirmDialog({ title: 'Kiyimni o‘chirish', message: `“${item.name}” butunlay o‘chiriladi${inOutfits ? `, ${inOutfits} ta obrazdan ham olib tashlanadi` : ''}. Agar shunchaki kiymayotgan bo‘lsangiz, “Arxiv” qulayroq.`, confirmText: 'O‘chirish', danger: true }))) return;
                await deleteItem(item);
                toast.ok('O‘chirildi');
                nav('/');
              }}
            >
              <Trash2 className="h-4 w-4" /> O‘chirish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
