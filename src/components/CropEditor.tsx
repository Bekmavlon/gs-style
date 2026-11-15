import clsx from 'clsx';
import { Minus, Plus, RotateCw, Check } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { decode, type CropRect } from '@/lib/images';

type AspectKey = 'asl' | '3:4' | '1:1' | '4:3';
const ASPECTS: { id: AspectKey; label: string; r: number | null }[] = [
  { id: 'asl', label: 'Asl', r: null },
  { id: '3:4', label: '3:4', r: 3 / 4 },
  { id: '1:1', label: '1:1', r: 1 },
  { id: '4:3', label: '4:3', r: 4 / 3 }
];

interface Src {
  bmp: ImageBitmap;
  url: string;
}

async function rotate(bmp: ImageBitmap): Promise<{ bmp: ImageBitmap; url: string }> {
  const cv = document.createElement('canvas');
  cv.width = bmp.height;
  cv.height = bmp.width;
  const ctx = cv.getContext('2d')!;
  ctx.translate(cv.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bmp, 0, 0);
  const blob: Blob = await new Promise((r) => cv.toBlob((b) => r(b!), 'image/jpeg', 0.95));
  return { bmp: await createImageBitmap(cv), url: URL.createObjectURL(blob) };
}

/**
 * Rasmni kesish: barmoq bilan surish, ikki barmoq bilan kattalashtirish (kompyuterda — g'ildirak),
 * nisbat tanlash va 90° burish. onDone — manba piksellaridagi to'rtburchak va (burilgan bo'lsa) yangi rasm.
 */
export function CropEditor({ blob, onDone, onSkip, doneLabel = 'Tayyor' }: { blob: Blob; onDone: (bmp: ImageBitmap, rect: CropRect) => void; onSkip?: () => void; doneLabel?: string }) {
  const [src, setSrc] = useState<Src | null>(null);
  const [aspect, setAspect] = useState<AspectKey>('3:4');
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [cw, setCw] = useState(320);
  const boxRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);

  useEffect(() => {
    let url = '';
    let alive = true;
    void decode(blob).then((bmp) => {
      if (!alive) return;
      url = URL.createObjectURL(blob);
      setSrc({ bmp, url });
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [blob]);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el);
    setCw(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const iw = src?.bmp.width ?? 1;
  const ih = src?.bmp.height ?? 1;
  const r = ASPECTS.find((a) => a.id === aspect)!.r ?? iw / ih;
  const maxH = Math.min(window.innerHeight * 0.58, 560);
  const fw = Math.min(cw, maxH * r);
  const fh = fw / r;
  const s0 = Math.max(fw / iw, fh / ih);
  const s = s0 * zoom;
  const dw = iw * s;
  const dh = ih * s;

  const clamp = useCallback(
    (o: { x: number; y: number }, w = dw, h = dh) => ({ x: Math.min(0, Math.max(fw - w, o.x)), y: Math.min(0, Math.max(fh - h, o.y)) }),
    [dw, dh, fw, fh]
  );

  // nisbat yoki rasm o'zgarsa — markazlash
  useEffect(() => {
    setZoom(1);
    const w = iw * s0, h = ih * s0;
    setOff({ x: (fw - w) / 2, y: (fh - h) / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, src, cw]);

  const zoomAt = (factor: number, cx = fw / 2, cy = fh / 2) => {
    const nz = Math.min(5, Math.max(1, zoom * factor));
    const ns = s0 * nz;
    const px = (cx - off.x) / s, py = (cy - off.y) / s; // manbadagi nuqta
    setZoom(nz);
    setOff(clamp({ x: cx - px * ns, y: cy - py * ns }, iw * ns, ih * ns));
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = null;
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinch.current) {
        const rect = boxRef.current!.getBoundingClientRect();
        zoomAt(d / pinch.current, (pts[0].x + pts[1].x) / 2 - rect.left - (cw - fw) / 2, (pts[0].y + pts[1].y) / 2 - rect.top);
      }
      pinch.current = d;
      return;
    }
    setOff((o) => clamp({ x: o.x + (e.clientX - prev.x), y: o.y + (e.clientY - prev.y) }));
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
  };

  const done = () => {
    if (!src) return;
    const rect: CropRect = {
      x: Math.max(0, -off.x / s),
      y: Math.max(0, -off.y / s),
      w: Math.min(iw, fw / s),
      h: Math.min(ih, fh / s)
    };
    onDone(src.bmp, rect);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div ref={boxRef} className="flex w-full justify-center">
        <div
          className="checker relative touch-none select-none overflow-hidden rounded-2xl"
          style={{ width: fw, height: fh }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onWheel={(e) => {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - rect.left, e.clientY - rect.top);
          }}
          role="application"
          aria-label="Rasmni kesish maydoni"
        >
          {src && (
            <img
              src={src.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-0 top-0 max-w-none"
              style={{ width: dw, height: dh, transform: `translate(${off.x}px, ${off.y}px)` }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/60" />
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/25" />
            ))}
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-muted">Rasmni surib, ikki barmoq bilan kattalashtiring</p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {ASPECTS.map((a) => (
          <button key={a.id} className={clsx('chip', aspect === a.id && 'chip-on')} onClick={() => setAspect(a.id)}>
            {a.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-outline h-10 w-10 p-0" onClick={() => zoomAt(1 / 1.2)} aria-label="Kichraytirish">
          <Minus className="h-4 w-4" />
        </button>
        <button
          className="btn-outline h-10 w-10 p-0"
          aria-label="90° burish"
          onClick={async () => {
            if (!src) return;
            const n = await rotate(src.bmp);
            URL.revokeObjectURL(src.url);
            setSrc(n);
          }}
        >
          <RotateCw className="h-4 w-4" />
        </button>
        <button className="btn-outline h-10 w-10 p-0" onClick={() => zoomAt(1.2)} aria-label="Kattalashtirish">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex w-full gap-2">
        {onSkip && (
          <button className="btn-outline flex-1" onClick={onSkip}>
            Kesmasdan
          </button>
        )}
        <button className="btn-primary flex-1" onClick={done} disabled={!src}>
          <Check className="h-4 w-4" /> {doneLabel}
        </button>
      </div>
    </div>
  );
}
