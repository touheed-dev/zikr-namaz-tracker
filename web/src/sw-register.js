// Registers the service worker in production builds only. When a new build is
// deployed, the new worker activates immediately (skipWaiting in sw.js) and we
// reload once so nobody stays on a stale build.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
      // check for updates when the app comes back to the foreground
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => { /* app works fine without the SW */ });

    let reloaded = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return; // first install: no reload needed
      reloaded = true;
      window.location.reload();
    });
  });
}
