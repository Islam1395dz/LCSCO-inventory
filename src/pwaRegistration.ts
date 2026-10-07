import { registerSW } from 'virtual:pwa-register';

/**
 * Registers the Service Worker for offline access to inventory data and QR scanner assets.
 * Uses vite-plugin-pwa virtual registration with a fallback to /sw.js.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const updateSW = registerSW({
      immediate: true,
      onRegisteredSW(swUrl, registration) {
        if (registration) {
          // Periodically check for updates every hour when online
          setInterval(() => {
            if (navigator.onLine) {
              registration.update().catch(() => {});
            }
          }, 60 * 60 * 1000);
        }
      },
      onOfflineReady() {
        window.dispatchEvent(new CustomEvent('lcsco-pwa-offline-ready'));
      },
      onNeedRefresh() {
        updateSW(true);
      },
    });
  } catch {
    // Fallback explicit registration of /sw.js if virtual module is unavailable in custom environments
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    });
  }
}
