import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';

// Service worker: yangi versiya chiqqanda foydalanuvchidan so'raladi
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({ immediate: true });
  if (!needRefresh) return null;
  return (
    <div className="no-print fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-surface2 px-4 py-2.5 text-sm shadow-lg lg:bottom-6">
      <RefreshCw className="h-4 w-4 text-gold" />
      Yangi versiya tayyor
      <button className="btn-primary px-2.5 py-1 text-xs" onClick={() => void updateServiceWorker(true)}>
        Yangilash
      </button>
      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setNeedRefresh(false)}>
        Keyin
      </button>
    </div>
  );
}
