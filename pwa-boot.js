(function () {
  'use strict';
  const id = window.JV_QR_LINKS?.entry(new URL(location.href));
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) manifest.href = id ? 'manifest-' + id + '.webmanifest' : 'manifest.webmanifest';
  if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
})();
