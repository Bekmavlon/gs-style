import clsx from 'clsx';
import { BarChart3, Cloud, CloudOff, HardDrive, Layers, Loader2, Plus, Shirt, Sparkles, Sun, UserRound, AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useSync } from '@/lib/sync';
import { UpdatePrompt } from '@/features/UpdatePrompt';

const NAV = [
  { to: '/', label: 'Garderob', icon: Shirt },
  { to: '/bugun', label: 'Bugun', icon: Sun },
  { to: '/stilist', label: 'Stilist', icon: Sparkles },
  { to: '/obrazlar', label: 'Obrazlar', icon: Layers },
  { to: '/statistika', label: 'Statistika', icon: BarChart3 }
];
// Mobil pastki menyu: 4 ta bo'lim + markazda "qo'shish". Statistika — sarlavhadagi tugmada.
const MOBILE = NAV.slice(0, 4);

function SyncDot() {
  const { status, pending } = useSync();
  const m = {
    local: { I: HardDrive, cls: 'text-muted', t: 'Faqat shu qurilmada' },
    idle: { I: Cloud, cls: 'text-ok', t: pending ? `${pending} ta navbatda` : 'Sinxronlangan' },
    syncing: { I: Loader2, cls: 'text-accent animate-spin', t: 'Sinxronlanmoqda' },
    offline: { I: CloudOff, cls: 'text-warn', t: 'Oflayn' },
    error: { I: AlertTriangle, cls: 'text-bad', t: 'Sinxron xatosi' }
  }[status];
  return (
    <Link to="/profil#hisob" title={m.t} aria-label={m.t} className="p-1.5">
      <m.I className={clsx('h-4 w-4', m.cls)} />
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const immersive = loc.pathname.startsWith('/qoshish');
  return (
    <div className="flex min-h-full">
      {!immersive && (
        <aside className="pt-safe sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
          <div className="mb-6 flex items-center gap-2 px-2">
            <Logo />
          </div>
          <Link to="/qoshish" className="btn-primary mb-4 w-full">
            <Plus className="h-4 w-4" /> Kiyim qo‘shish
          </Link>
          <nav className="flex-1 space-y-0.5">
            {[...NAV, { to: '/profil', label: 'Profil', icon: UserRound }].map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) => clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm', isActive ? 'bg-surface2 font-medium text-accent' : 'text-muted hover:bg-surface2 hover:text-fg')}
              >
                <n.icon className="h-[18px] w-[18px]" />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2 px-2 text-xs text-muted">
            <SyncDot /> Holat
          </div>
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {!immersive && (
          <header className="pt-safe sticky top-0 z-20 border-b border-line/60 bg-bg/90 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between px-4 py-2.5">
              <Logo />
              <div className="flex items-center gap-1">
                <SyncDot />
                <NavLink to="/statistika" aria-label="Statistika" className={({ isActive }) => clsx('rounded-full p-1.5', isActive ? 'text-accent' : 'text-fg')}>
                  <BarChart3 className="h-5 w-5" />
                </NavLink>
                <NavLink to="/profil" aria-label="Profil" className={({ isActive }) => clsx('rounded-full p-1.5', isActive ? 'text-accent' : 'text-fg')}>
                  <UserRound className="h-5 w-5" />
                </NavLink>
              </div>
            </div>
          </header>
        )}
        <main className={clsx('mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6', immersive ? 'pt-safe pb-8' : 'pb-28 pt-4 lg:pb-10 lg:pt-6')}>{children}</main>
      </div>
      {!immersive && (
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden" aria-label="Asosiy menyu">
          <div className="grid grid-cols-5 items-end">
            {MOBILE.slice(0, 2).map((n) => (
              <Tab key={n.to} {...n} />
            ))}
            <div className="flex justify-center">
              <Link to="/qoshish" aria-label="Kiyim qo‘shish" className="-mt-5 mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg shadow-accent/30">
                <Plus className="h-6 w-6" />
              </Link>
            </div>
            {MOBILE.slice(2).map((n) => (
              <Tab key={n.to} {...n} />
            ))}
          </div>
        </nav>
      )}
      <UpdatePrompt />
    </div>
  );
}

function Tab({ to, label, icon: I }: { to: string; label: string; icon: typeof Shirt }) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive ? 'font-medium text-accent' : 'text-muted')}>
      <I className="h-5 w-5" />
      {label}
    </NavLink>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5a2 2 0 1 1 2 2c-.8 0-2 .6-2 1.6V9l8 5.2c.9.6.5 1.8-.6 1.8H4.6c-1.1 0-1.5-1.2-.6-1.8L12 9" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-tight">G.S.Style</span>
    </span>
  );
}
