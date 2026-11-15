import { Camera, Check, Images, Sparkles, Wand2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { confirmDialog, toast, Toggle, ProgressBar } from '@/components/ui';
import { CropEditor } from '@/components/CropEditor';
import { ItemForm, emptyInput } from '@/components/ItemForm';
import { useSettings } from '@/lib/data';
import { bgRemovalAvailable, decode, extOf, removeBackground, renderCrop, storeImage, type CropRect } from '@/lib/images';
import { dominantColorIds, samplePixels } from '@/lib/color';
import { addItem, type ItemInput } from '@/lib/actions';
import { db } from '@/lib/db';
import { saveSettings } from '@/lib/repo';

const MAX = 20;

interface Processed {
  imageId: string;
  ext: string;
  url: string;
  colors: string[];
  bgRemoved: boolean;
}

type Stage = 'pick' | 'crop' | 'process' | 'review' | 'done';

export default function AddItemPage() {
  const nav = useNavigate();
  const settings = useSettings();
  const [stage, setStage] = useState<Stage>('pick');
  const [files, setFiles] = useState<File[]>([]);
  const [cropIdx, setCropIdx] = useState(0);
  const crops = useRef<{ bmp: ImageBitmap | null; rect: CropRect | null; file: File }[]>([]);
  const [progress, setProgress] = useState({ i: 0, pct: 0, text: '' });
  const [done, setDone] = useState<Processed[]>([]);
  const [revIdx, setRevIdx] = useState(0);
  const [saved, setSaved] = useState(0);
  const [last, setLast] = useState<Partial<ItemInput>>({});
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const canBg = bgRemovalAvailable();
  const useBg = canBg && settings.remove_bg;

  useEffect(() => () => done.forEach((d) => URL.revokeObjectURL(d.url)), [done]);

  const pick = (list: FileList | null) => {
    if (!list?.length) return;
    const imgs = [...list].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    if (!imgs.length) return toast.error('Rasm topilmadi');
    if (imgs.length > MAX) toast.info(`Bir vaqtda ${MAX} tagacha — birinchi ${MAX} tasi olindi`);
    const take = imgs.slice(0, MAX);
    crops.current = take.map((file) => ({ bmp: null, rect: null, file }));
    setFiles(take);
    setCropIdx(0);
    setStage('crop');
  };

  const nextCrop = (bmp: ImageBitmap | null, rect: CropRect | null) => {
    crops.current[cropIdx] = { ...crops.current[cropIdx], bmp, rect };
    if (cropIdx + 1 < files.length) setCropIdx(cropIdx + 1);
    else void processAll();
  };

  const processAll = async () => {
    setStage('process');
    const out: Processed[] = [];
    const n = crops.current.length;
    for (let i = 0; i < n; i++) {
      const c = crops.current[i];
      const base = (i / n) * 100;
      const step = (p: number, text: string) => setProgress({ i, pct: Math.round(base + (p / 100) * (100 / n)), text });
      try {
        step(5, 'Rasm tayyorlanmoqda');
        const bmp = c.bmp ?? (await decode(c.file));
        let { blob } = await renderCrop(bmp, c.rect, 1080, false);
        let bgRemoved = false;
        if (useBg) {
          step(30, 'Fon olib tashlanmoqda');
          const nb = await removeBackground(blob, (st, pct) => step(30, st === 'model' ? `Fon modeli yuklanmoqda${pct ? ` ${pct}%` : ''} (bir marta)` : 'Fon olib tashlanmoqda'));
          if (nb) {
            blob = nb;
            bgRemoved = true;
          }
        }
        step(75, 'Rang aniqlanmoqda');
        const colors = dominantColorIds(await samplePixels(blob, bgRemoved));
        step(90, 'Saqlanmoqda');
        const img = await storeImage(blob, bgRemoved);
        out.push({ imageId: img.id, ext: extOf(img.mime), url: URL.createObjectURL(img.thumb), colors, bgRemoved });
      } catch (e) {
        console.error(e);
        toast.error(`${i + 1}-rasmni o‘qib bo‘lmadi`);
      }
    }
    setProgress({ i: n, pct: 100, text: 'Tayyor' });
    if (!out.length) {
      setStage('pick');
      return;
    }
    setDone(out);
    setRevIdx(0);
    setStage('review');
  };

  const cur = done[revIdx];
  const advance = () => {
    if (revIdx + 1 < done.length) setRevIdx(revIdx + 1);
    else setStage('done');
  };

  const leave = async () => {
    const unsaved = stage === 'review' ? done.slice(revIdx) : [];
    if ((stage === 'review' && unsaved.length) || stage === 'crop') {
      if (!(await confirmDialog({ title: 'Chiqasizmi?', message: 'Saqlanmagan kiyimlar qo‘shilmaydi.', confirmText: 'Chiqish', danger: true }))) return;
      for (const u of unsaved) await db.images.delete(u.imageId);
    }
    nav('/');
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between bg-bg/95 px-4 py-3 backdrop-blur">
        <button className="btn-ghost -ml-2 p-2" onClick={() => void leave()} aria-label="Yopish">
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold">Kiyim qo‘shish</div>
          <div className="text-[11px] text-muted">
            {stage === 'crop' && `Kesish: ${cropIdx + 1} / ${files.length}`}
            {stage === 'process' && `Tayyorlanmoqda: ${Math.min(progress.i + 1, crops.current.length)} / ${crops.current.length}`}
            {stage === 'review' && `${revIdx + 1} / ${done.length} · ${saved} ta qo‘shildi`}
          </div>
        </div>
        <span className="w-9" />
      </div>

      {stage === 'pick' && (
        <div className="space-y-4">
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <Images className="h-8 w-8" />
            </div>
            <h1 className="text-lg font-semibold">Rasmlarni tanlang</h1>
            <p className="mt-1 text-sm text-muted">Bir vaqtda 1–{MAX} ta rasm. Har bir rasmda bitta kiyim bo‘lgani ma’qul.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button className="card flex flex-col items-center gap-2 py-6 hover:border-accent/50" onClick={() => galleryRef.current?.click()}>
              <Images className="h-7 w-7 text-accent" />
              <span className="font-medium">Galereya</span>
              <span className="text-xs text-muted">1–{MAX} ta rasm</span>
            </button>
            <button className="card flex flex-col items-center gap-2 py-6 hover:border-accent/50" onClick={() => cameraRef.current?.click()}>
              <Camera className="h-7 w-7 text-accent" />
              <span className="font-medium">Kamera</span>
              <span className="text-xs text-muted">Hozir suratga olish</span>
            </button>
          </div>
          <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
          <div className="card space-y-2 text-sm">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /> Asosiy rang avtomatik aniqlanadi</div>
            <div className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-accent" /> Fonni olib tashlash {canBg ? '— telefonning o‘zida, bepul' : '— Android ilovasida ishlaydi'}</div>
            {canBg && <Toggle checked={settings.remove_bg} onChange={(v) => void saveSettings({ remove_bg: v })} label="Fonni avtomatik olib tashlash" />}
          </div>
          <p className="text-center text-xs text-muted">Maslahat: kiyimni tekis, yorug‘ va bir xil rangli joyga qo‘yib suratga oling.</p>
        </div>
      )}

      {stage === 'crop' && files[cropIdx] && (
        <div>
          <CropEditor key={cropIdx} blob={files[cropIdx]} onDone={(b, r) => nextCrop(b, r)} onSkip={() => nextCrop(null, null)} doneLabel={cropIdx + 1 < files.length ? 'Keyingisi' : 'Tayyor'} />
          {files.length > 1 && (
            <button className="mt-4 w-full text-center text-xs font-medium text-muted underline" onClick={() => void processAll()}>
              Qolganlarini kesmasdan davom etish
            </button>
          )}
        </div>
      )}

      {stage === 'process' && (
        <div className="space-y-5 py-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
            <Wand2 className="h-8 w-8 animate-pulse text-accent" />
          </div>
          <div>
            <div className="text-lg font-semibold">{progress.pct}%</div>
            <div className="text-sm text-muted">{progress.text}</div>
          </div>
          <ProgressBar value={progress.pct} />
          <p className="text-xs text-muted">Hammasi telefoningizda bajariladi — rasmlar hech qayerga yuborilmaydi.</p>
        </div>
      )}

      {stage === 'review' && cur && (
        <div key={cur.imageId}>
          <div className="photo-bg mb-4 flex aspect-square items-center justify-center overflow-hidden rounded-2xl">
            <img src={cur.url} alt="" className="h-full w-full object-contain p-6" />
          </div>
          {cur.bgRemoved && <p className="-mt-2 mb-3 text-center text-xs text-ok">Fon olib tashlandi</p>}
          <ItemForm
            initial={emptyInput(cur.colors, last)}
            autoColors={cur.colors}
            submitLabel={revIdx + 1 < done.length ? 'Qo‘shish va keyingisi' : 'Garderobga qo‘shish'}
            onSubmit={async (v) => {
              await addItem(v, { id: cur.imageId, ext: cur.ext, bgRemoved: cur.bgRemoved });
              setLast({ category: v.category, subtype: v.subtype });
              setSaved((s) => s + 1);
              advance();
            }}
          />
          <button
            className="mt-3 w-full py-2 text-center text-xs text-muted"
            onClick={async () => {
              await db.images.delete(cur.imageId);
              advance();
            }}
          >
            Bu rasmni o‘tkazib yuborish
          </button>
        </div>
      )}

      {stage === 'done' && (
        <div className="space-y-4 py-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ok/15 text-ok">
            <Check className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-semibold">{saved} ta kiyim garderobga qo‘shildi</h2>
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => { setStage('pick'); setDone([]); setSaved(0); }}>
              Yana qo‘shish
            </button>
            <button className="btn-primary flex-1" onClick={() => nav('/')}>
              Garderobga
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
