(function () {
  'use strict';
  const id = window.JV_QR_LINKS?.entry(new URL(location.href));
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) manifest.href = (id ? 'manifest-' + id + '.webmanifest' : 'manifest.webmanifest') + '?v=' + encodeURIComponent(window.JV_QR_LINKS.release);
  if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(registration => {
        if (typeof registration.update === 'function') registration.update().catch(() => {});
      }).catch(() => {});
    });
  }
})();
