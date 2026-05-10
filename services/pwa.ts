import { registerSW } from 'virtual:pwa-register';

export const registerServiceWorker = () => {
  if ('serviceWorker' in navigator) {
    const updateSW = registerSW({
      onNeedRefresh() {
        // Show update prompt to user
        if (confirm('Versi baru tersedia. Muat semula sekarang?')) {
          updateSW(true);
        }
      },
      onOfflineReady() {
        console.log('[PWA] App sedia untuk digunakan secara offline.');
      },
      onRegisteredSW(swUrl, registration) {
        // Check for updates every hour
        if (registration) {
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000);
        }
      },
      onRegisterError(error) {
        console.error('[PWA] Service worker registration failed:', error);
      }
    });
  }
};
