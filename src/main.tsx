import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register VitePWA Service Worker with automatic background updates and fallback to /sw.js
if (typeof window !== 'undefined') {
  try {
    registerSW({
      immediate: true,
      onRegisteredSW(swUrl) {
        console.info('[LCSCO PWA] Service worker registered:', swUrl);
      },
      onOfflineReady() {
        console.info('[LCSCO PWA] Offline inventory & QR scanner cache ready.');
      },
    });
  } catch {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
          // Ignore registration errors in restricted preview frames
        });
      });
    }
  }
}

createRoot(document.getElementById('root')!).render(<App />);
