import 'fake-indexeddb/auto';
// Node muhitida navigator.onLine yo'q — onlayn deb hisoblaymiz
if (typeof navigator !== 'undefined' && (navigator as Navigator).onLine === undefined) {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
}
(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = 'test';
