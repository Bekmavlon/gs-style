import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ConfirmHost, Loading, ToastHost } from '@/components/ui';
import { useSettings } from '@/lib/data';
import { startAutoSync } from '@/lib/sync';
import { ErrorBoundary } from '@/features/ErrorBoundary';
import { isNative } from '@/lib/images';

const Wardrobe = lazy(() => import('@/pages/Wardrobe'));
const AddItem = lazy(() => import('@/pages/AddItem'));
const ItemDetail = lazy(() => import('@/pages/ItemDetail'));
const Today = lazy(() => import('@/pages/Today'));
const Outfits = lazy(() => import('@/pages/Outfits'));
const Stats = lazy(() => import('@/pages/Stats'));
const Profile = lazy(() => import('@/pages/Profile'));
const Stylist = lazy(() => import('@/pages/Stylist'));

function ThemeApplier() {
  const s = useSettings();
  useEffect(() => {
    const apply = () => {
      const dark = s.theme === 'dark' || (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121313' : '#f6f4f0');
      if (isNative())
        void import('@capacitor/core')
          .then(({ SystemBars, SystemBarsStyle }) => SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }))
          .catch(() => undefined);
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [s.theme]);
  return null;
}

export default function App() {
  useEffect(() => {
    startAutoSync();
    void navigator.storage?.persist?.();
  }, []);
  return (
    <HashRouter>
      <ThemeApplier />
      <AppShell>
        <ErrorBoundary>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Wardrobe />} />
              <Route path="/qoshish" element={<AddItem />} />
              <Route path="/kiyim/:id" element={<ItemDetail />} />
              <Route path="/bugun" element={<Today />} />
              <Route path="/stilist" element={<Stylist />} />
              <Route path="/obrazlar" element={<Outfits />} />
              <Route path="/statistika" element={<Stats />} />
              <Route path="/profil" element={<Profile />} />
              <Route path="*" element={<Wardrobe />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </AppShell>
      <ConfirmHost />
      <ToastHost />
    </HashRouter>
  );
}
