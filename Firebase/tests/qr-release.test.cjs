const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const origin = 'https://stardustfll.github.io/Green-Window/';
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup(href = origin + 'instalar.html?planta=planta-3') {
  const data = new Map([
    ['jv_demo_v1', JSON.stringify({ users: { legacy: { nome: 'Teste local', regs: ['preservado'] } }, session: 'legacy' })],
    ['jv_pending_plant_v1', JSON.stringify({ plantId: 'planta-2' })]
  ]);
  const elements = new Map(), events = {}, calls = [];
  let updates = 0;
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { textContent: '', href: '', classList: { add() {} } });
    return elements.get(selector);
  };
  const sandbox = {
    URL, location: { href, protocol: 'https:' },
    localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) },
    document: { currentScript: { src: origin + 'qr-links.js?v=bootstrap' }, querySelector: element },
    window: { addEventListener: (name, fn) => { events[name] = fn; }, matchMedia: () => ({ matches: false }) },
    navigator: { serviceWorker: { register: async (url, options) => {
      calls.push({ url, options }); return { update: async () => { updates++; } };
    } } }
  };
  vm.createContext(sandbox);
  vm.runInContext(read('qr-links.js'), sandbox);
  return { sandbox, links: sandbox.window.JV_QR_LINKS, data, element, events, calls, updates: () => updates };
}

test('QR release opens the current entry while preserving earlier QR links and stored accounts', () => {
  const h = setup(), before = h.data.get('jv_demo_v1'), release = h.links.release;
  assert.match(release, /^\d{8}-\d+$/);
  assert.equal(h.links.pending(), 'planta-2');
  const urls = new Set();
  for (let n = 1; n <= 6; n++) {
    const id = 'planta-' + n, install = new URL(h.links.build(id)), app = new URL(h.links.appUrl(id));
    urls.add(install.href);
    assert.equal(install.pathname, '/Green-Window/instalar.html');
    assert.equal(install.searchParams.get('planta'), id);
    assert.equal(install.searchParams.get('v'), release);
    assert.equal(app.pathname, '/Green-Window/index.html');
    assert.equal(app.searchParams.get('planta'), id);
    assert.equal(app.searchParams.get('v'), release);
    for (const qr of [install.href, origin + 'instalar.html?planta=' + id,
      origin + 'instalar.html?planta=' + id + '&v=20261027-1', 'janelaverde:' + id]) {
      assert.equal(h.links.parse(qr), id);
    }
  }
  assert.equal(urls.size, 6);
  assert.equal(new URL(h.links.appUrl()).searchParams.has('planta'), false);
  for (const bad of ['https://other.example/Green-Window/instalar.html?planta=planta-1&v=' + release,
    origin + 'index.html?planta=planta-1', origin + 'instalar.html?planta=planta-7',
    origin + 'instalar.html?planta=planta-1&planta=planta-2',
    origin + 'instalar.html?planta=planta-1#other']) assert.equal(h.links.parse(bad), null);
  assert.equal(h.data.get('jv_demo_v1'), before);
});

test('public entry and version 20 contain the same current app and version their local scripts', () => {
  const release = setup().links.release;
  assert.equal(read('index.html'), read('Janela Verde (20).html'));
  const current = read('index.html');
  assert.match(current, /window\.JV_UNLOCKS\.capture\(\)/);
  assert.match(current, /Mapa de utilização do aplicativo/);
  assert.match(current, /const LS="jv_demo_v1"/);
  for (const file of ['index.html', 'Janela Verde (20).html', 'instalar.html']) {
    const html = read(file);
    for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
      const script = new URL(match[1], origin);
      if (script.origin !== new URL(origin).origin) continue;
      assert.equal(script.searchParams.get('v'), release, `${file}: ${match[1]}`);
      const local = decodeURIComponent(script.pathname.slice('/Green-Window/'.length));
      assert.ok(fs.existsSync(path.join(root, local)), local);
    }
  }
  const fallback = /id="open-app"[^>]*href="([^"]+)"/.exec(read('instalar.html'));
  assert.ok(fallback);
  assert.equal(new URL(fallback[1], origin).pathname, '/Green-Window/index.html');
});

test('all installed entry points keep one app identity and launch the current release', () => {
  const release = setup().links.release;
  for (const n of [null, 1, 2, 3, 4, 5, 6]) {
    const manifest = JSON.parse(read(n ? 'manifest-planta-' + n + '.webmanifest' : 'manifest.webmanifest'));
    const start = new URL(manifest.start_url, origin);
    assert.equal(manifest.id, './'); assert.equal(manifest.scope, './');
    assert.equal(start.pathname, '/Green-Window/index.html');
    assert.equal(start.searchParams.get('v'), release);
    assert.equal(start.searchParams.get('planta'), n ? 'planta-' + n : null);
  }
});

for (const file of ['pwa-boot.js', 'install.js']) {
  test(`${file}: revalidates the worker and selected manifest without changing saved accounts`, async () => {
    const h = setup(origin + (file === 'install.js' ? 'instalar.html' : 'index.html') + '?planta=planta-3');
    const before = h.data.get('jv_demo_v1');
    vm.runInContext(read(file), h.sandbox);
    if (h.events.load) await h.events.load();
    await tick();
    assert.equal(h.calls.length, 1);
    assert.equal(new URL(h.calls[0].url, origin).pathname, '/Green-Window/sw.js');
    assert.equal(h.calls[0].options?.updateViaCache, 'none');
    assert.equal(h.updates(), 1);
    const manifest = new URL(h.element(file === 'install.js' ? '#app-manifest' : 'link[rel="manifest"]').href, origin);
    assert.equal(manifest.pathname, '/Green-Window/manifest-planta-3.webmanifest');
    assert.equal(manifest.searchParams.get('v'), h.links.release);
    if (file === 'install.js') {
      const destination = new URL(h.element('#open-app').href);
      assert.equal(destination.pathname, '/Green-Window/index.html');
      assert.equal(destination.searchParams.get('planta'), 'planta-3');
    }
    assert.equal(h.data.get('jv_demo_v1'), before);
  });
}

function worker() {
  const events = {}, buckets = new Map(), network = [], deleted = [], additions = [];
  const state = { offline: false, skipped: false, claimed: false };
  const key = request => typeof request === 'string' ? new URL(request, origin).href : request.url;
  const match = (items, request, options) => {
    const wanted = new URL(key(request));
    for (const [url, response] of items) {
      const cached = new URL(url);
      if (url === wanted.href || options?.ignoreSearch && cached.origin === wanted.origin && cached.pathname === wanted.pathname) return response.clone();
    }
  };
  const open = async name => {
    if (!buckets.has(name)) buckets.set(name, new Map());
    const items = buckets.get(name);
    return {
      addAll: async requests => {
        for (const request of requests) { additions.push(request); items.set(key(request), new Response('offline-shell')); }
      },
      put: async (request, response) => { items.set(key(request), response); },
      match: async (request, options) => match(items, request, options)
    };
  };
  const sandbox = {
    URL, Request, Response,
    self: { registration: { scope: origin }, location: { origin: new URL(origin).origin },
      addEventListener: (name, fn) => { events[name] = fn; }, skipWaiting: async () => { state.skipped = true; },
      clients: { claim: async () => { state.claimed = true; } } },
    caches: { open, keys: async () => [...buckets.keys()], delete: async name => { deleted.push(name); return buckets.delete(name); },
      match: async (request, options) => {
        for (const items of buckets.values()) { const response = match(items, request, options); if (response) return response; }
      } },
    fetch: async (request, options) => {
      network.push({ request, options });
      if (state.offline) throw new TypeError('Network unavailable');
      return new Response('current-release', { status: 200 });
    }
  };
  vm.runInNewContext(read('sw.js'), sandbox);
  return { events, buckets, network, deleted, additions, state,
    async dispatch(type, request) {
      const waits = []; let response;
      events[type]({ request, waitUntil: pending => waits.push(pending), respondWith: pending => { response = pending; } });
      if (response) response = await response;
      await Promise.all(waits);
      return response;
    } };
}

test('worker installation revalidates both entry pages and activates without deleting unrelated caches', async () => {
  const h = worker(), release = setup().links.release;
  h.buckets.set('green-window-shell-qr-older', new Map());
  h.buckets.set('unrelated-cache', new Map());
  await h.dispatch('install');
  assert.ok(h.additions.length > 0);
  for (const request of h.additions) {
    assert.ok(request instanceof Request);
    assert.equal(request.cache, 'reload');
    assert.equal(new URL(request.url).origin, new URL(origin).origin);
  }
  const paths = h.additions.map(request => decodeURIComponent(new URL(request.url).pathname));
  assert.ok(paths.includes('/Green-Window/index.html'));
  assert.ok(paths.includes('/Green-Window/Janela Verde (20).html'));
  assert.ok([...h.buckets.keys()].some(name => name.includes(release)));
  await h.dispatch('activate');
  assert.equal(h.state.skipped, true); assert.equal(h.state.claimed, true);
  assert.equal(h.buckets.has('unrelated-cache'), true);
  assert.equal(h.buckets.has('green-window-shell-qr-older'), false);
  assert.deepEqual(h.deleted, ['green-window-shell-qr-older']);
});

test('worker fetch revalidates current app files, keeps offline QR entry usable, and ignores personal APIs', async () => {
  const h = worker();
  await h.dispatch('install');
  for (const file of ['index.html?planta=planta-1&v=current', 'Janela%20Verde%20(20).html', 'qr-links.js?v=current']) {
    const response = await h.dispatch('fetch', new Request(origin + file));
    assert.ok(response, file);
    assert.equal(await response.text(), 'current-release');
    const call = h.network.at(-1);
    assert.equal(call.options?.cache || call.request.cache, 'no-cache');
  }
  h.state.offline = true;
  const fallback = await h.dispatch('fetch', new Request(origin + 'index.html?planta=planta-6&v=another'));
  assert.ok(fallback); assert.equal(fallback.ok, true);
  assert.ok(['offline-shell', 'current-release'].includes(await fallback.text()));
  const before = h.network.length;
  for (const url of ['https://firestore.googleapis.com/v1/projects/project',
    'https://identitytoolkit.googleapis.com/v1/accounts:signUp', origin + 'cadastros/user', origin + 'unknown.json']) {
    assert.equal(await h.dispatch('fetch', new Request(url)), undefined);
  }
  assert.equal(await h.dispatch('fetch', new Request(origin + 'index.html', { method: 'POST' })), undefined);
  assert.equal(h.network.length, before);
});
