import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import {
  Apple, BookOpen, Bed, Brain, Clock, Code, Coffee, Droplet, Dumbbell, Flame, Footprints, GraduationCap,
  HeartPulse, Languages, Leaf, Moon, Music, PenLine, Shield, Smartphone, Sprout, Star, Sun, Target, X,
  AlertTriangle, CheckCircle2, Info, Loader2, type LucideIcon
} from 'lucide-react';
import { create } from 'zustand';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// ===== Qayta ishlatiladigan UI komponentlari =====

export const ICONS: Record<string, LucideIcon> = {
  Apple, BookOpen, Bed, Brain, Clock, Code, Coffee, Droplet, Dumbbell, Flame, Footprints, GraduationCap,
  HeartPulse, Languages, Leaf, Moon, Music, PenLine, Shield, Smartphone, Sprout, Star, Sun, Target
};

export function DynIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const I = ICONS[name] ?? Star;
  return <I className={className} style={style} />;
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={clsx('card', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="section-title">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h-title">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-bad">{error}</span>}
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            className={clsx(
              'flex max-h-[88vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl',
              wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'
            )}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="text-base font-semibold">{title}</h2>
              <button className="btn-ghost -mr-2 p-1.5" onClick={onClose} aria-label="Yopish">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3 pb-safe">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---- Tasdiqlash dialogi (global) ----
interface ConfirmReq {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
}
const useConfirmStore = create<{ req: ConfirmReq | null; set: (r: ConfirmReq | null) => void }>((set) => ({
  req: null,
  set: (req) => set({ req })
}));

export function confirmDialog(o: Omit<ConfirmReq, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.getState().set({ ...o, resolve }));
}

export function ConfirmHost() {
  const { req, set } = useConfirmStore();
  const close = (v: boolean) => {
    req?.resolve(v);
    set(null);
  };
  return (
    <Modal
      open={!!req}
      onClose={() => close(false)}
      title={req?.title ?? ''}
      footer={
        <>
          <button className="btn-outline" onClick={() => close(false)}>
            Bekor qilish
          </button>
          <button className={req?.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)} autoFocus>
            {req?.confirmText ?? 'Tasdiqlash'}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted">{req?.message}</p>
    </Modal>
  );
}

// ---- Toast ----
type ToastKind = 'ok' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}
const useToasts = create<{ items: ToastItem[]; push: (k: ToastKind, t: string) => void; drop: (id: number) => void }>((set) => ({
  items: [],
  push: (kind, text) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items, { id, kind, text }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 3800);
  },
  drop: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
}));

export const toast = {
  ok: (t: string) => useToasts.getState().push('ok', t),
  error: (t: string) => useToasts.getState().push('error', t),
  info: (t: string) => useToasts.getState().push('info', t)
};

export function ToastHost() {
  const { items, drop } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end">
      <AnimatePresence>
        {items.map((t) => (
          <motion.button
            key={t.id}
            onClick={() => drop(t.id)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl border border-line bg-surface2 px-4 py-2.5 text-left text-sm shadow-lg"
          >
            {t.kind === 'ok' && <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />}
            {t.kind === 'error' && <AlertTriangle className="h-4 w-4 shrink-0 text-bad" />}
            {t.kind === 'info' && <Info className="h-4 w-4 shrink-0 text-accent" />}
            <span>{t.text}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function EmptyState({ icon: I = Info, title, text, action }: { icon?: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <I className="mb-3 h-7 w-7 text-muted" />
      <p className="font-medium">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading({ text = 'Yuklanmoqda…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> {text}
    </div>
  );
}

export function ProgressBar({ value, className, color }: { value: number | null; className?: string; color?: string }) {
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className={clsx('h-2 w-full overflow-hidden rounded-full bg-surface2', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${v}%`, background: color ?? 'rgb(var(--accent))' }} />
    </div>
  );
}

export function ProgressRing({ value, size = 120, stroke = 10, label, sub }: { value: number | null; size?: number; stroke?: number; label?: ReactNode; sub?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(var(--surface2))" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgb(var(--accent))"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-semibold tabular-nums">{label ?? (value === null ? '—' : Math.round(v))}</span>
        {sub && <span className="text-[11px] text-muted">{sub}</span>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div className={clsx('inline-flex rounded-lg border border-line bg-surface2 p-0.5', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, icon: I }: { label: string; value: ReactNode; sub?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        {I && <I className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function NumberInput({ value, onChange, min, max, step, placeholder, className, id }: { value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; placeholder?: string; className?: string; id?: string }) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(value === null ? '' : String(value));
      last.current = value;
    }
  }, [value]);
  return (
    <input
      id={id}
      className={clsx('input', className)}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        const t = e.target.value.replace(',', '.');
        setText(t);
        if (t.trim() === '') {
          last.current = null;
          onChange(null);
          return;
        }
        const n = Number(t);
        if (!Number.isNaN(n)) {
          let v = n;
          if (min !== undefined) v = Math.max(min, v);
          if (max !== undefined) v = Math.min(max, v);
          last.current = v;
          onChange(v);
        }
      }}
      step={step}
    />
  );
}

export function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm">{label}</span>
        {desc && <span className="block text-xs text-muted">{desc}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface2 border border-line')}
      >
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' | 'ok' | 'warn' | 'bad' }) {
  const map = {
    muted: 'border-line text-muted',
    accent: 'border-accent/40 text-accent',
    ok: 'border-ok/40 text-ok',
    warn: 'border-warn/40 text-warn',
    bad: 'border-bad/40 text-bad'
  };
  return <span className={clsx('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', map[tone])}>{children}</span>;
}
