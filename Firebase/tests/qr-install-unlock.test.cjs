const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'Janela Verde (20).html'), 'utf8');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const origin = 'https://stardustfll.github.io/Green-Window/';
function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function setup(href = origin + 'Janela%20Verde%20(20).html', disk = storage()) {
  const user = { coll: {}, shots: [], sched: [], pg: {}, pc: {}, plants: [], regs: [], pts: [], char: 'Teste' };
  const elements = new Map();
  const element = key => {
    if (!elements.has(key)) elements.set(key, { textContent: '', innerHTML: '', value: '', classList: { add() {} } });
    return elements.get(key);
  };
  const sandbox = { window: {}, URL, location: { href, protocol: new URL(href).protocol }, localStorage: disk, history: { replaceState: () => {} },
    document: { currentScript: { src: origin + 'qr-links.js' } },
    DB: { session: 'user1' }, CFG: {}, V: {}, tmp: {}, U: () => user, $: element,
    save: () => true, toast: () => {}, render: () => {}, go: () => {}, recordVaseScan: () => {},
    day: v => new Date(v).toISOString().slice(0, 10), fmt: () => 'hoje', esc: v => String(v ?? ''), av: () => '', saldo: () => 0 };
  vm.createContext(sandbox);
  vm.runInContext(read('qr-links.js'), sandbox);
  vm.runInContext(read('plant-unlocks.js'), sandbox);
  const extension = html.slice(html.indexOf('/* ===== PLANTAS v2:'), html.indexOf('\nwindow.JV_UNLOCKS.capture();'));
  vm.runInContext(extension, sandbox);
  const row = n => ({ plantId: 'planta-' + n, code: 'janelaverde:planta-' + n, active: true, plantName: 'Planta ' + n, token: 'planta-' + n });
  return { sandbox, user, element, links: sandbox.window.JV_QR_LINKS, unlocks: sandbox.window.JV_UNLOCKS, row };
}

test('all six QR links open one installation page while retaining six distinct plant IDs', () => {
  const { links } = setup();
  const urls = links.ids.map(id => links.build(id));
  assert.equal(new Set(urls).size, 6);
  for (let n = 1; n <= 6; n++) {
    const url = new URL(urls[n - 1]);
    assert.equal(url.pathname, '/Green-Window/instalar.html');
    assert.equal(url.searchParams.get('planta'), 'planta-' + n);
    assert.equal(links.parse(url.href), 'planta-' + n);
    assert.equal(links.parse('janelaverde:planta-' + n), 'planta-' + n);
  }
  for (const bad of ['https://evil.example/Green-Window/instalar.html?planta=planta-1', origin + 'outra.html?planta=planta-1',
    origin + 'instalar.html?planta=planta-7', origin + 'instalar.html?planta=planta-1&planta=planta-2']) assert.equal(links.parse(bad), null);
  assert.equal(links.portable('http://127.0.0.1:8766/instalar.html?planta=planta-1'), false);
});

test('all plants start locked, including old photo-based collection entries', () => {
  const { sandbox, user, unlocks, row, element } = setup();
  user.coll.onze = { ts: 1, src: 'foto', foto: 'legacy-photo' };
  const plants = vm.runInContext('PL', sandbox);
  assert.equal(plants.filter(p => unlocks.locked(user, p)).length, 6);
  assert.equal((sandbox.V.catalog().match(/🔒 Bloqueada — leia/g) || []).length, 6);
  sandbox.infoPlant('onze');
  assert.match(element('#modal').innerHTML, /Escanear QR desta planta/);
  assert.doesNotMatch(element('#modal').innerHTML, /Disque-Intoxicação/);
  unlocks.grant(row(6));
  assert.equal(plants.filter(p => !unlocks.locked(user, p)).length, 1);
  assert.equal(unlocks.locked(user, plants.find(p => p.id === 'jabuticaba')), false);
  assert.equal(user.coll.onze.foto, 'legacy-photo');
  assert.equal(user.coll.jabuticaba.projectPlantId, 'planta-6');
});

test('photo identification, manual selection and old schedules cannot unlock or progress a locked plant', () => {
  const { sandbox, user } = setup();
  sandbox.tmp.idf = { foto: 'test-photo', manual: 0, msg: '' };
  sandbox.idAdd('onze', 'manual');
  assert.equal(user.coll.onze, undefined);
  sandbox.idAdd('jabuticaba', 'IA', 'alta');
  assert.equal(user.coll.jabuticaba, undefined);
  user.sched.push({ id: 'old', plant: 'onze', data: '2020-01-01', done: 0 });
  sandbox.schDone('old'); assert.equal(user.sched[0].done, 0);
  sandbox.openShot('onze', 'vaso'); assert.equal(sandbox.tmp.sh, undefined);
});

test('an installation link survives login and grants just one plant after the server validates it', async () => {
  const { sandbox, user, links, unlocks, row } = setup(origin + 'Janela%20Verde%20(20).html?planta=planta-3');
  let calls = 0;
  sandbox.claude = { use: async () => ({ scan: async code => { calls++; assert.equal(code, 'janelaverde:planta-3'); return row(3); } }) };
  sandbox.U = () => null; sandbox.DB.session = null;
  unlocks.capture(); await unlocks.process();
  assert.equal(calls, 0); assert.equal(links.pending(), 'planta-3');
  sandbox.U = () => user; sandbox.DB.session = 'user1';
  await unlocks.process();
  assert.deepEqual(Object.keys(user.coll), ['tradescantia']);
  assert.equal(user.coll.tradescantia.qrUnlocked, true);
  assert.equal(links.pending(), null);
  await unlocks.process(); assert.equal(calls, 1);
});

test('validation failure retains the pending QR and never unlocks a plant; explicit retry can recover', async () => {
  const { sandbox, user, links, unlocks, row } = setup();
  links.remember('planta-2'); let calls = 0;
  sandbox.claude = { use: async () => ({ scan: async () => { calls++; throw new Error('offline'); } }) };
  await unlocks.process(); await unlocks.process();
  assert.equal(calls, 1); assert.equal(Object.keys(user.coll).length, 0); assert.equal(links.pending(), 'planta-2');
  sandbox.claude.use = async () => ({ scan: async () => row(2) });
  await unlocks.retry(); assert.equal(user.coll.lambari.qrUnlocked, true);
});

test('unlocks do not cross accounts or survive failed local storage writes', async () => {
  const { sandbox, user, unlocks, row } = setup();
  assert.equal(unlocks.grant(row(1), 'different-user'), null);
  sandbox.save = () => false;
  assert.equal(unlocks.grant(row(1)), null);
  assert.equal(user.coll.onze, undefined); assert.equal(user.pg.onze, undefined);
  assert.equal(unlocks.grant({ ...row(1), code: 'invented' }), null);
  assert.equal(unlocks.grant({ ...row(1), active: false }), null);
});

test('scanning the wrong plant in a specific unlock dialog does not increment its counter', async () => {
  const { sandbox, unlocks, row, user } = setup();
  let validation, done, scans = 0;
  sandbox.scanCam = (_, fn, onDone) => { validation = fn; done = onDone; };
  sandbox.claude = { use: async () => ({ lookup: async value => row(Number(value.slice(-1))), scan: async value => { scans++; return row(Number(value.slice(-1))); } }) };
  unlocks.scan('planta-1');
  assert.equal(await validation('janelaverde:planta-2'), null); assert.equal(scans, 0);
  const valid = await validation('janelaverde:planta-1'); done('', valid);
  assert.equal(scans, 1); assert.equal(user.coll.onze.qrUnlocked, true); assert.equal(user.coll.lambari, undefined);
});

test('installation manifests keep the selected plant at first launch and share one application identity', () => {
  const baseline = JSON.parse(read('manifest.webmanifest'));
  for (let n = 1; n <= 6; n++) {
    const manifest = JSON.parse(read('manifest-planta-' + n + '.webmanifest'));
    assert.equal(manifest.id, baseline.id);
    assert.equal(new URL(manifest.start_url, origin).searchParams.get('planta'), 'planta-' + n);
    for (const icon of manifest.icons) {
      const image = fs.readFileSync(path.join(root, icon.src));
      assert.equal(image.subarray(1, 4).toString(), 'PNG');
      assert.equal(image.readUInt32BE(16) + 'x' + image.readUInt32BE(20), icon.sizes);
    }
  }
});

test('the installation screen preserves the plant in the app link and only prompts after a user click', async () => {
  const { sandbox, element, links } = setup(origin + 'instalar.html?planta=planta-4');
  const events = {}; let prompts = 0;
  sandbox.document.querySelector = element;
  sandbox.window.addEventListener = (name, fn) => { events[name] = fn; };
  sandbox.window.matchMedia = () => ({ matches: false });
  sandbox.navigator = { serviceWorker: { register: async () => ({}) } };
  element('#install-button').hidden = true;
  vm.runInContext(read('install.js'), sandbox);
  assert.equal(links.pending(), 'planta-4');
  assert.equal(element('#app-manifest').href, 'manifest-planta-4.webmanifest');
  assert.equal(new URL(element('#open-app').href).searchParams.get('planta'), 'planta-4');
  events.beforeinstallprompt({ preventDefault() {}, prompt: async () => { prompts++; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  assert.equal(prompts, 0); assert.equal(element('#install-button').hidden, false);
  await element('#install-button').onclick();
  assert.equal(prompts, 1); assert.equal(links.pending(), 'planta-4');
});

test('an invalid installation link clears a stale pending selection instead of unlocking another plant', () => {
  const { sandbox, element, links } = setup(origin + 'instalar.html?planta=planta-7');
  links.remember('planta-2');
  sandbox.document.querySelector = element;
  sandbox.window.addEventListener = () => {};
  sandbox.window.matchMedia = () => ({ matches: false });
  sandbox.navigator = {};
  vm.runInContext(read('install.js'), sandbox);
  assert.equal(links.pending(), null);
  assert.equal(new URL(element('#open-app').href).searchParams.has('planta'), false);
  assert.match(element('#plant-message').textContent, /não corresponde/);
});

test('the worker never intercepts Firebase or authentication API requests', () => {
  const events = {};
  const sandbox = { URL, self: { registration: { scope: origin }, location: { origin: new URL(origin).origin }, addEventListener: (name, fn) => { events[name] = fn; } } };
  vm.runInNewContext(read('sw.js'), sandbox);
  for (const url of ['https://firestore.googleapis.com/v1/projects/test', 'https://identitytoolkit.googleapis.com/v1/accounts:signUp', origin + 'unknown.json']) {
    let intercepted = false;
    events.fetch({ request: { method: 'GET', url }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});
