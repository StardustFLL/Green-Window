/* Links públicos dos seis QR Codes. Não concede desbloqueio: o app valida no Firestore. */
(function () {
  'use strict';
  const ids = Object.freeze(Array.from({ length: 6 }, (_, i) => 'planta-' + (i + 1)));
  const scriptRoot = new URL('.', document.currentScript?.src || location.href);
  const pendingKey = 'jv_pending_plant_v1';
  const validId = id => ids.includes(id);
  const code = id => validId(id) ? 'janelaverde:' + id : null;
  function installationPage() {
    const configured = window.JV_FIREBASE_CONFIG?.installPageUrl;
    const url = new URL(configured || 'instalar.html', scriptRoot);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Endereço de instalação inválido.');
    url.searchParams.delete('planta'); url.hash = '';
    return url;
  }
  function build(id) {
    if (!validId(id)) throw new Error('Planta inválida.');
    const url = installationPage(); url.searchParams.set('planta', id); return url.href;
  }
  function entry(url) {
    const values = url.searchParams.getAll('planta');
    return values.length === 1 && validId(values[0]) ? values[0] : null;
  }
  function parse(raw) {
    const value = String(raw || '').trim();
    const legacy = /^janelaverde:(planta-[1-6])$/.exec(value);
    if (legacy) return legacy[1];
    try {
      const url = new URL(value), expected = installationPage();
      if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash) return null;
      return entry(url);
    } catch (_) { return null; }
  }
  function portable(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && !/^(localhost|127\.|\[::1\])/.test(u.hostname);
    } catch (_) { return false; }
  }
  function remember(id, storage = localStorage) {
    if (!validId(id)) return false;
    storage.setItem(pendingKey, JSON.stringify({ plantId: id })); return true;
  }
  function pending(storage = localStorage) {
    try { const value = JSON.parse(storage.getItem(pendingKey)); return validId(value?.plantId) ? value.plantId : null; }
    catch (_) { return null; }
  }
  window.JV_QR_LINKS = Object.freeze({ ids, validId, code, build, parse, entry, portable, remember, pending,
    clear(storage = localStorage) { storage.removeItem(pendingKey); },
    appUrl(id) { const url = new URL('Janela Verde (20).html', scriptRoot); if (validId(id)) url.searchParams.set('planta', id); return url.href; }
  });
})();
