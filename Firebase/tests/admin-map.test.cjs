const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../admin-map.js'), 'utf8');
const clean = value => JSON.parse(JSON.stringify(value));
function element() {
  return { isConnected: true, textContent: '', attributes: {}, events: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, fn) { this.events[name] = fn; } };
}
function setup(leaflet = true) {
  const maps = [], tiles = [], markers = [], observers = [], views = [], selections = [];
  let gpsReads = 0;
  const evented = object => Object.assign(object, {
    events: {}, on(names, fn) { for (const name of names.split(' ')) this.events[name] = fn; return this; },
    off(names) { for (const name of names.split(' ')) delete this.events[name]; return this; },
    emit(name) { this.events[name]?.(); return this; }
  });
  const L = {
    map(container, options) {
      const map = evented({ container, options, calls: [], center: { lat: 0, lng: 0 }, zoom: 0,
        setView(position, zoom, options) {
          this.calls.push({ method: 'setView', position: clean(position), zoom, options });
          this.center = { lat: position[0], lng: position[1] }; this.zoom = zoom;
          this.emit('moveend'); return this;
        },
        setZoom(zoom) { this.zoom = zoom; this.calls.push({ method: 'setZoom', zoom }); this.emit('zoomend'); return this; },
        fitBounds(points, options) {
          this.calls.push({ method: 'fitBounds', points: clean(points), options });
          this.center = { lat: points.reduce((sum, p) => sum + p[0], 0) / points.length,
            lng: points.reduce((sum, p) => sum + p[1], 0) / points.length };
          this.zoom = 8; this.emit('moveend'); return this;
        },
        fitWorld() { this.calls.push({ method: 'fitWorld' }); this.center = { lat: 0, lng: 0 }; this.zoom = 1; this.emit('moveend'); return this; },
        getCenter() { return this.center; }, getZoom() { return this.zoom; },
        invalidateSize() { this.invalidations = (this.invalidations || 0) + 1; return this; },
        remove() { this.removed = true; return this; }
      });
      maps.push(map); return map;
    },
    tileLayer(url, options) {
      const layer = evented({ url, options, addTo(map) { this.map = map; return this; } });
      tiles.push(layer); return layer;
    },
    layerGroup() {
      return { children: [], addTo(map) { map.markers = this; return this; },
        clearLayers() { this.children = []; return this; } };
    },
    circleMarker(position, options) {
      const marker = evented({ position: clean(position), options, path: element(),
        addTo(group) { group.children.push(this); return this; },
        bindTooltip(node, options) { this.tooltip = { node, options }; return this; },
        bindPopup(node) { this.popup = node; return this; }, openPopup() { this.opened = true; return this; },
        getElement() { return this.path; }
      });
      markers.push(marker); return marker;
    }
  };
  const navigator = {};
  Object.defineProperty(navigator, 'geolocation', { get() { gpsReads++; throw new Error('GPS must not be read'); } });
  const sandbox = { window: leaflet ? { L } : {}, navigator,
    document: { body: element(), createElement: () => element() },
    MutationObserver: class {
      constructor(fn) { this.fn = fn; observers.push(this); }
      observe() { this.watching = true; } disconnect() { this.watching = false; }
    }
  };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  return { api: sandbox.window.JV_ADMIN_MAP, maps, tiles, markers, observers, views, selections,
    options: { onSelect: ids => selections.push(clean(ids)), onViewChange: url => views.push(url) }, gpsReads: () => gpsReads };
}
const limeira = { lat: -22.6, lng: -47.4, city: 'Limeira', uf: 'SP', ids: [0, 2] };
const campinas = { lat: -22.9, lng: -47.0, city: 'Campinas', uf: 'SP', ids: [1] };

test('an empty administrator map still displays a navigable OSM base without GPS or fictitious markers', () => {
  const h = setup(), box = element(), result = h.api.render(box, [], h.options);
  assert.equal(result.ready, true); assert.equal(result.count, 0); assert.equal(result.markers, 0);
  assert.deepEqual(clean(h.maps[0].center), { lat: -14, lng: -52 });
  assert.equal(h.maps[0].options.scrollWheelZoom, true); assert.equal(h.maps[0].options.dragging, true);
  assert.equal(h.maps[0].options.attributionControl, true); assert.equal(h.maps[0].options.maxZoom, 19);
  assert.equal(h.tiles[0].url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.match(h.tiles[0].options.attribution, /openstreetmap\.org\/copyright/);
  assert.equal('referrerPolicy' in h.tiles[0].options, false);
  assert.equal('headers' in h.tiles[0].options, false);
  assert.equal('cache' in h.tiles[0].options, false);
  assert.equal(h.gpsReads(), 0); assert.equal(h.markers.length, 0);
});

test('resolved groups become red selectable markers, retaining distinct municipalities and account counts', () => {
  const h = setup(), box = element();
  const result = h.api.render(box, [limeira, campinas], h.options);
  assert.equal(result.count, 3); assert.equal(result.markers, 2);
  assert.deepEqual(h.markers.map(marker => marker.position), [[-22.6, -47.4], [-22.9, -47]]);
  for (const marker of h.markers) {
    assert.equal(marker.options.fillColor, '#dc2626'); assert.equal(marker.options.color, '#ffffff');
    assert.equal(marker.path.attributes.role, 'button'); assert.equal(marker.path.attributes.tabindex, '0');
  }
  assert.equal(h.markers[0].tooltip.node.textContent, '2');
  assert.equal(h.markers[0].tooltip.options.permanent, true);
  h.markers[0].emit('click'); assert.deepEqual(h.selections, [[0, 2]]);
  h.selections[0].push(99); h.markers[0].emit('click'); assert.deepEqual(h.selections[1], [0, 2]);
  assert.equal(h.maps[0].calls.at(-1).method, 'fitBounds');
});

test('malformed coordinates and empty identity groups cannot create points', () => {
  const h = setup();
  const result = h.api.render(element(), [null, {}, { ...limeira, lat: NaN }, { ...limeira, lng: Infinity },
    { ...limeira, lat: 89 }, { ...limeira, lng: -181 }, { ...limeira, ids: [] },
    { ...limeira, ids: [-1, '0', 0, 0, 2] }]);
  assert.equal(result.markers, 1); assert.equal(result.count, 2);
  assert.equal(h.markers[0].path.attributes['aria-label'], 'Limeira – SP · 2 conta(s)');
});

test('city labels are DOM text rather than executable popup HTML; tiles receive no participant data', () => {
  const h = setup();
  h.api.render(element(), [{ ...limeira, city: '<img src=x onerror=alert(1)>', nome: 'Pessoa privada', email: 'privado@example.test', endereco: 'Rua privada, 100' }]);
  const popup = h.markers[0].popup;
  assert.match(popup.textContent, /<img src=x/); assert.equal(Object.hasOwn(popup, 'innerHTML'), false);
  const remote = JSON.stringify(h.tiles.map(layer => ({ url: layer.url, options: layer.options })));
  for (const privateValue of ['Pessoa privada', 'privado@example.test', 'Rua privada', 'onerror']) assert.equal(remote.includes(privateValue), false);
});

test('rendering again reuses the map and replaces old markers without undoing an intentional zoom', () => {
  const h = setup(), box = element();
  h.api.render(box, [limeira], h.options);
  const staleMarker = h.markers[0];
  h.api.zoom(box, 1.6); assert.equal(h.maps[0].zoom, 12);
  h.api.render(box, [], h.options); h.api.render(box, [limeira], h.options);
  assert.equal(h.maps.length, 1); assert.equal(h.tiles.length, 1); assert.equal(h.maps[0].zoom, 12);
  assert.equal(h.maps[0].markers.children.length, 1);
  staleMarker.emit('click'); assert.deepEqual(h.selections, []);
  h.api.render(box, [campinas], h.options); assert.deepEqual(clean(h.maps[0].center), { lat: -22.9, lng: -47 });
});

test('keyboard selection and view changes keep the direct OpenStreetMap URL in sync', () => {
  const h = setup(), box = element();
  h.api.render(box, [limeira], h.options);
  let prevented = false;
  h.markers[0].path.events.keydown({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.deepEqual(h.selections, [[0, 2]]); assert.equal(h.markers[0].opened, true);
  h.api.zoom(box, 1.6);
  assert.equal(h.api.externalURL(box), 'https://www.openstreetmap.org/#map=12/-22.60000/-47.40000');
  assert.equal(h.views.at(-1), h.api.externalURL(box));
  h.maps[0].center = { lat: 40, lng: 540 }; h.maps[0].emit('moveend');
  assert.equal(h.views.at(-1), 'https://www.openstreetmap.org/#map=12/40.00000/-180.00000');
  h.api.fit(box, true); assert.equal(h.maps[0].calls.at(-1).method, 'fitWorld');
  h.api.fit(box, false); assert.equal(h.maps[0].zoom, 11);
});

test('zoom controls clamp supported levels and ignore invalid factors', () => {
  const h = setup(), box = element(); h.api.render(box, []);
  h.maps[0].zoom = 19; h.api.zoom(box, 1.6); assert.equal(h.maps[0].zoom, 19);
  h.maps[0].zoom = 0; h.api.zoom(box, 1 / 1.6); assert.equal(h.maps[0].zoom, 0);
  for (const factor of [0, -1, NaN, Infinity, 1]) assert.equal(h.api.zoom(box, factor), false);
  assert.equal(h.api.zoom(element(), 1.6), false); assert.equal(h.api.fit(element(), true), false);
});

test('leaving the administrator view cleans the Leaflet instance and rejects stale marker events', () => {
  const h = setup(), box = element(); h.api.render(box, [limeira], h.options);
  box.isConnected = false; h.observers[0].fn();
  assert.equal(h.maps[0].removed, true); assert.equal(h.observers[0].watching, false);
  h.markers[0].emit('click'); assert.deepEqual(h.selections, []);
  assert.equal(h.api.destroy(box), false);
  const second = element(); h.api.render(second, [campinas], h.options);
  assert.equal(h.maps.length, 2); assert.equal(h.api.destroy(second), true); assert.equal(h.maps[1].removed, true);
});

test('missing map library provides a direct link and recoverable message instead of crashing the admin page', () => {
  const h = setup(false), box = element(), result = h.api.render(box, [limeira], h.options);
  assert.equal(result.ready, false); assert.equal(result.markers, 0);
  assert.match(result.url, /^https:\/\/www\.openstreetmap\.org\/#map=/);
  assert.match(box.textContent, /Use o link/); assert.equal(h.views.at(-1), result.url);
  assert.equal(h.api.render(null).ready, false);
});

test('tile failures notify the current view once without disabling zoom or reusing participant information', () => {
  const h = setup(), box = element(), errors = [];
  h.api.render(box, [limeira], { ...h.options, onError: error => errors.push(error) });
  h.tiles[0].emit('tileerror'); h.tiles[0].emit('tileerror');
  assert.equal(errors.length, 1); assert.match(errors[0], /OpenStreetMap/);
  assert.equal(h.api.zoom(box, 1.6), true);
  h.api.destroy(box); h.tiles[0].emit('tileerror'); assert.equal(errors.length, 1);
});
