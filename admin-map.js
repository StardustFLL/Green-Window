/* Mapa detalhado do administrador, com Leaflet e OpenStreetMap.
   Recebe somente grupos de municípios; não usa GPS nem consulta endereços.
   https://leafletjs.com/reference.html
   https://operations.osmfoundation.org/policies/tiles/ */
(function () {
  'use strict';
  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
  const HOME = [-14, -52], HOME_ZOOM = 4, MIN_ZOOM = 0, MAX_ZOOM = 19;
  const states = new WeakMap(), active = new Set();
  let observer;

  function mapURL(center = { lat: HOME[0], lng: HOME[1] }, zoom = HOME_ZOOM) {
    const lat = Number.isFinite(center.lat) ? Math.max(-85.0511, Math.min(85.0511, center.lat)) : HOME[0];
    const lng = Number.isFinite(center.lng) ? ((center.lng + 180) % 360 + 360) % 360 - 180 : HOME[1];
    const level = Number.isFinite(zoom) ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom))) : HOME_ZOOM;
    return 'https://www.openstreetmap.org/#map=' + level + '/' + lat.toFixed(5) + '/' + lng.toFixed(5);
  }
  function externalURL(container) {
    const state = states.get(container);
    if (!state || state.destroyed) return mapURL();
    try { return mapURL(state.map.getCenter(), state.map.getZoom()); }
    catch (_) { return mapURL(); }
  }
  function notifyView(state) {
    if (state.destroyed || state.container.isConnected === false) return;
    try { state.options.onViewChange?.(externalURL(state.container)); } catch (_) {}
  }
  function remove(state) {
    if (!state || state.destroyed) return false;
    state.destroyed = true;
    active.delete(state); states.delete(state.container);
    try { state.map.off('moveend zoomend', state.viewHandler); state.map.remove(); } catch (_) {}
    if (!active.size && observer) { observer.disconnect(); observer = null; }
    return true;
  }
  function destroy(container) { return remove(states.get(container)); }
  function prune() {
    for (const state of active) if (state.container.isConnected === false) remove(state);
  }
  function watch() {
    if (!observer && typeof MutationObserver === 'function' && document.body) {
      observer = new MutationObserver(prune);
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
  function textNode(text) {
    const node = document.createElement('span');
    node.textContent = text;
    return node;
  }
  function validGroups(groups) {
    if (!Array.isArray(groups)) return [];
    return groups.flatMap(group => {
      if (!group || !Number.isFinite(group.lat) || Math.abs(group.lat) > 85.0511
        || !Number.isFinite(group.lng) || Math.abs(group.lng) > 180 || !Array.isArray(group.ids)) return [];
      const ids = [...new Set(group.ids.filter(id => Number.isInteger(id) && id >= 0))];
      if (!ids.length) return [];
      return [{ lat: group.lat, lng: group.lng, city: String(group.city || 'Município'),
        uf: String(group.uf || ''), ids }];
    });
  }
  function fitGroups(state) {
    if (state.groups.length === 1) {
      const point = state.groups[0];
      state.map.setView([point.lat, point.lng], 11, { animate: false });
    } else if (state.groups.length > 1) {
      state.map.fitBounds(state.groups.map(point => [point.lat, point.lng]),
        { padding: [36, 36], maxZoom: 12, animate: false });
    } else state.map.setView(HOME, HOME_ZOOM, { animate: false });
  }
  function result(state, error = '') {
    return { ready: !!state && !state.destroyed, url: externalURL(state?.container),
      count: state ? state.groups.reduce((sum, group) => sum + group.ids.length, 0) : 0,
      markers: state?.groups.length || 0, error };
  }

  function render(container, groups = [], options = {}) {
    prune();
    if (!container || typeof container !== 'object') return result(null, 'Área do mapa indisponível.');
    let state = states.get(container);
    const L = window.L;
    if (!L || typeof L.map !== 'function' || typeof L.tileLayer !== 'function') {
      destroy(container);
      container.textContent = 'O mapa detalhado não pôde ser carregado. Use o link para abrir no OpenStreetMap.';
      const failed = result(null, 'Biblioteca do mapa indisponível.');
      try { options.onViewChange?.(failed.url); } catch (_) {}
      return failed;
    }
    try {
      if (!state) {
        container.textContent = '';
        const map = L.map(container, { minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, zoomControl: true,
          attributionControl: true, scrollWheelZoom: true, touchZoom: true, keyboard: true,
          dragging: true, worldCopyJump: true });
        state = { container, map, groups: [], options, generation: 0, destroyed: false,
          lastSignature: '', tileErrorReported: false };
        states.set(container, state); active.add(state);
        state.viewHandler = () => notifyView(state);
        map.on('moveend zoomend', state.viewHandler);
        // Imagens normais: preservam Referer e cache HTTP do navegador. Sem prefetch.
        state.tiles = L.tileLayer(TILE_URL, { maxZoom: MAX_ZOOM, attribution: ATTRIBUTION,
          updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 1 }).addTo(map);
        state.tiles.on('tileerror', () => {
          if (state.destroyed || state.container.isConnected === false || state.tileErrorReported) return;
          state.tileErrorReported = true;
          try { state.options.onError?.('Não foi possível carregar parte do mapa. Verifique a conexão ou abra no OpenStreetMap.'); } catch (_) {}
        });
        state.markers = L.layerGroup().addTo(map);
        map.setView(HOME, HOME_ZOOM, { animate: false });
        watch();
      }
      state.options = options; state.tileErrorReported = false;
      state.groups = validGroups(groups); state.generation++;
      const generation = state.generation;
      state.markers.clearLayers();
      for (const group of state.groups) {
        const label = group.city + (group.uf ? ' – ' + group.uf : '') + ' · ' + group.ids.length + ' conta(s)';
        const marker = L.circleMarker([group.lat, group.lng], { radius: group.ids.length > 1 ? 12 : 8,
          color: '#ffffff', weight: 2, fillColor: '#dc2626', fillOpacity: 0.95,
          className: 'jv-usage-marker', bubblingMouseEvents: false }).addTo(state.markers);
        const select = () => {
          if (state.destroyed || state.container.isConnected === false || state.generation !== generation) return;
          try { state.options.onSelect?.([...group.ids]); } catch (_) {}
        };
        marker.on('click', select);
        marker.bindTooltip(textNode(group.ids.length > 1 ? String(group.ids.length) : label), group.ids.length > 1
          ? { permanent: true, direction: 'center', className: 'jv-map-count', opacity: 1 }
          : { direction: 'top', opacity: 1 });
        marker.bindPopup(textNode(label + '. Localização aproximada do município.'));
        const path = marker.getElement?.();
        if (path) {
          path.setAttribute('tabindex', '0'); path.setAttribute('role', 'button'); path.setAttribute('aria-label', label);
          path.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); marker.openPopup(); }
          });
        }
      }
      const signature = state.groups.map(group => [group.lat, group.lng, group.ids.join(',')].join(':')).join('|');
      if (signature && signature !== state.lastSignature) { fitGroups(state); state.lastSignature = signature; }
      // Reabrir a mesma lista não desfaz o zoom que o administrador escolheu.
      state.map.invalidateSize({ animate: false, pan: false });
      notifyView(state);
      return result(state);
    } catch (_) {
      destroy(container);
      container.textContent = 'O mapa detalhado não pôde ser carregado. Use o link para abrir no OpenStreetMap.';
      const failed = result(null, 'Não foi possível iniciar o mapa detalhado.');
      try { options.onViewChange?.(failed.url); } catch (_) {}
      return failed;
    }
  }
  function zoom(container, factor) {
    const state = states.get(container);
    if (!state || state.destroyed || !Number.isFinite(factor) || factor <= 0 || factor === 1) return false;
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.map.getZoom() + (factor > 1 ? 1 : -1)));
    state.map.setZoom(next, { animate: false }); notifyView(state);
    return true;
  }
  function fit(container, all) {
    const state = states.get(container);
    if (!state || state.destroyed) return false;
    if (all) state.map.fitWorld({ animate: false });
    else fitGroups(state);
    notifyView(state);
    return true;
  }
  window.JV_ADMIN_MAP = Object.freeze({ render, zoom, fit, destroy, externalURL });
})();
