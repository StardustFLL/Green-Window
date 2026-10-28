const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const pages = ['index.html', 'Janela Verde (20).html'];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const clean = value => JSON.parse(JSON.stringify(value));
function section(html, start, end) {
  const from = html.indexOf(start), to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing section: ${start} -> ${end}`);
  return html.slice(from, to);
}
function assertDefined(value, at = 'payload') {
  assert.notEqual(value, undefined, `${at} must not contain undefined`);
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) assertDefined(child, `${at}.${key}`);
  }
}
function oldUser() {
  return {
    id: 'legacy', nome: 'Pessoa Teste', email: 'legacy@example.test', tel: '(19) 99999-0000', nasc: '2000-01-01',
    cpf: 'legacy-cpf-value', salt: 'test-salt', ph: 'test-salt:Teste1234', char: 'Teste', avatar: '🌱',
    consent: 1, created: 1, cloudConsent: false, cloudConsentAt: 1, onboarded: true,
    end: 'Rua das Flores, 120, Limeira – SP', locNote: 'GPS autorizado anteriormente',
    geo: { lat: -22.5, lng: -47.4, acc: 5 }, gpsConsent: true, gpsAccuracy: 5,
    plants: [{ id: 'placeholder', nome: 'Minha planta', especie: '', inicio: '2026-10-28',
      local: 'Rua das Flores, 120, Limeira – SP', geo: { lat: -22.5, lng: -47.4, acc: 5 }, foto: '', obs: '' }],
    regs: [], pts: [], resg: [], qr: [], coll: {}, shots: [], sched: [], pg: {}, pc: {}
  };
}
function setup(file, gpsEnabled) {
  const html = read(file), elements = new Map(), state = {
    navigatorReads: 0, gpsReads: 0, gpsCalls: 0, gpsError: null, forbidGPS: gpsEnabled !== true,
    aiCalls: 0, routes: [], saves: 0, sent: []
  };
  const inputs = {
    nome: 'Pessoa Teste', email: 'pessoa@example.test', tel: '(19) 99999-0000', nasc: '2000-01-01',
    luf: 'SP', lcid: 'Limeira', lloc: 'Rua das Flores, 120', pw: 'Teste1234', pw2: 'Teste1234',
    le: 'legacy@example.test', lp: 'Teste1234', ro: 'Minha planta está crescendo'
  };
  for (const [id, value] of Object.entries(inputs)) elements.set('#' + id, { value });
  for (const id of ['nome', 'email', 'tel', 'nasc', 'loc', 'pw', 'pw2', 'lgpd', 'resp']) elements.set('#e_' + id, { textContent: '' });
  for (const id of ['sb', 'rs', 're', 'modal', 'le_e', 'hp']) elements.set('#' + id, { textContent: '', innerHTML: '', disabled: false, style: {}, scrollIntoView() {} });
  for (const id of ['lgpd', 'resp', 'cloud', 'gpsok']) elements.set('#' + id, { checked: id === 'lgpd' || id === 'resp' });
  const DB = { users: {}, session: null };
  const nativeGPS = { getCurrentPosition(ok, fail) {
    state.gpsCalls++;
    if (state.gpsError) return fail(state.gpsError);
    ok({ coords: { latitude: -22.6, longitude: -47.5, accuracy: 4.2 } });
  } };
  const navigator = {};
  Object.defineProperty(navigator, 'geolocation', { get() { state.gpsReads++; return nativeGPS; } });
  const sandbox = {
    window: { isSecureContext: true }, DB, V: {}, V2: {}, tmp: {},
    $: selector => elements.get(selector) || null,
    U: () => DB.users[DB.session], hdr: value => `<h2>${value}</h2>`,
    esc: value => String(value ?? ''), day: value => new Date(value).toISOString().slice(0, 10),
    newSalt: () => 'test-salt', hash: async (pw, salt) => `${salt}:${pw}`, uniqueChar: async name => name,
    showSug: () => {}, toast: () => {}, save: () => { state.saves++; return true; },
    syncUser: async () => {}, syncReg: async () => {}, pubRank: () => {}, go: route => state.routes.push(route),
    geoEnd: async () => { state.aiCalls++; throw new Error('Address validation must not call cloud AI'); },
    openSample: async () => { state.aiCalls++; throw new Error('Address validation must not call cloud AI'); },
    getAv: () => ({}), admX: () => ({}), saldo: user => user.pts.reduce((n, point) => n + point.v, 0),
    PLI: () => ({ projectPlantId: 'planta-1' }), setTimeout: () => 1,
    logFoto: () => {}, verify: async () => ({ ok: true, m: 'planta reconhecida' })
  };
  Object.defineProperty(sandbox, 'navigator', { get() {
    state.navigatorReads++;
    assert.equal(state.forbidGPS, false, 'this flow must not access navigator');
    return navigator;
  } });
  vm.createContext(sandbox);
  vm.runInContext(read('app-features.js'), sandbox);
  if (gpsEnabled !== undefined) sandbox.window.JV_FEATURES = { ...sandbox.window.JV_FEATURES, gpsEnabled };
  vm.runInContext(section(html, 'const CFG=', 'const AVATARS='), sandbox);
  vm.runInContext('CFG.modoTeste=false', sandbox);
  vm.runInContext(section(html, 'V.signup=', 'const UFC='), sandbox);
  vm.runInContext(section(html, 'function addrLocal(', 'async function geoEnd('), sandbox);
  vm.runInContext(section(html, 'const gps=', '/* --- Login --- */'), sandbox);
  vm.runInContext(section(html, 'V.login=', 'function recover('), sandbox);
  return { html, sandbox, DB, elements, state, gps: () => vm.runInContext('gps()', sandbox),
    flag: () => vm.runInContext('CFG.gpsAtivo', sandbox),
    activateCloud() {
      sandbox.dbh = async () => ({ id: 'firebase-test-uid', db: { doc: () => ({
        get: async () => ({ exists: false }),
        set: async data => { assertDefined(data); state.sent.push(clean(data)); }
      }) } });
      vm.runInContext(section(html, 'async function syncUser(){', 'async function syncReg('), sandbox);
      vm.runInContext(section(html, 'async function syncReg(', 'function admX('), sandbox);
    }
  };
}

async function recordPlant(h) {
  const row = { plantId: 'planta-1', plantName: 'Planta 1', code: 'janelaverde:planta-1', token: 'planta-1', vaseId: 'planta-1', vaseName: 'Planta 1' };
  h.sandbox.verifyVaseQR = async () => row;
  Object.assign(h.sandbox.tmp, { qrCode: row.code, qrVase: row, foto: 'plant-photo', th: 'plant-thumbnail', okFoto: 'plant-photo' });
  vm.runInContext(section(h.html, 'async function saveReg(){', 'async function saveRegEdit('), h.sandbox);
  await h.sandbox.saveReg();
}

test('the shared feature switch disables GPS by default', () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read('app-features.js'), sandbox);
  assert.equal(sandbox.window.JV_FEATURES.gpsEnabled, false);
});

for (const file of pages) {
  test(`${file}: signup removes CPF and presents the address as the plant's cultivation location`, () => {
    const h = setup(file);
    assert.match(h.html, /<script src="app-features\.js(?:\?[^\"]*)?"><\/script>/);
    assert.equal(h.flag(), false);
    const form = h.sandbox.V.signup();
    assert.doesNotMatch(form, /id="cpf"|id="e_cpf"|<label>CPF<\/label>/);
    assert.match(form, /Endereço (?:da planta|do local de cultivo)/);
    assert.doesNotMatch(form, /Endereço onde mora|id="gpsok"/);
    assert.doesNotMatch(h.sandbox.V.login(), /CPF|cpf/);
    assert.match(setup(file, true).sandbox.V.signup(), /id="gpsok"/);
  });

  test(`${file}: disabled GPS blocks direct native access and signup needs neither CPF nor cloud AI`, async () => {
    const h = setup(file);
    await assert.rejects(h.gps(), /GPS desativado/);
    assert.equal(h.state.navigatorReads, 0);
    assert.equal(h.state.gpsReads, 0);
    // A stale checkbox, such as one left in an already-rendered form, cannot bypass the feature switch.
    h.elements.get('#gpsok').checked = true;
    await h.sandbox.signup();
    const user = h.DB.users[h.DB.session];
    assert.ok(user, 'valid signup should succeed while cloud AI and GPS are unavailable');
    assert.equal(Object.hasOwn(user, 'cpf'), false);
    assert.equal(user.end, 'Rua das Flores, 120, Limeira – SP');
    assert.deepEqual(clean(user.localCultivo), { endereco: 'Rua das Flores, 120', cidade: 'Limeira', uf: 'SP' });
    assert.deepEqual(clean(user.plants[0].localCultivo), clean(user.localCultivo));
    assert.equal(user.plants[0].local, user.end);
    assert.equal(user.plants[0].geo, null);
    assert.equal(user.geo, null);
    assert.equal(user.gpsConsent, false);
    assert.equal(user.gpsAccuracy, null);
    assert.equal(h.state.gpsReads, 0);
    assert.equal(h.state.navigatorReads, 0);
    assert.equal(h.state.gpsCalls, 0);
    assert.equal(h.state.aiCalls, 0);
    assert.equal(h.state.routes.at(-1), 'intro1');
  });

  test(`${file}: the manual address still rejects incomplete input without using network services`, async () => {
    const h = setup(file);
    h.elements.get('#lloc').value = 'Rua das Flores';
    await h.sandbox.signup();
    assert.equal(h.DB.session, null);
    assert.match(h.elements.get('#e_loc').textContent, /número|numero/i);
    assert.equal(h.state.gpsReads, 0);
    assert.equal(h.state.aiCalls, 0);
  });

  test(`${file}: re-enabling GPS requires explicit consent and stores the plant's location`, async () => {
    const declined = setup(file, true);
    declined.state.forbidGPS = true;
    await declined.sandbox.signup();
    assert.ok(declined.DB.session);
    assert.equal(declined.state.gpsCalls, 0);
    assert.equal(declined.state.navigatorReads, 0);
    assert.equal(declined.DB.users[declined.DB.session].geo, null);
    const accepted = setup(file, true);
    accepted.elements.get('#gpsok').checked = true;
    await accepted.sandbox.signup();
    const user = accepted.DB.users[accepted.DB.session];
    assert.ok(user);
    assert.equal(accepted.state.gpsCalls, 1);
    assert.equal(accepted.state.aiCalls, 0);
    assert.equal(user.gpsConsent, true);
    assert.deepEqual(clean(user.geo), { lat: -22.6, lng: -47.5, acc: 4 });
    assert.deepEqual(clean(user.plants[0].geo), clean(user.geo));
    assert.equal(user.plants[0].local, 'Rua das Flores, 120, Limeira – SP');
  });

  test(`${file}: denied or failed optional GPS still creates an account with the manual address`, async () => {
    for (const code of [1, 2, 3]) {
      const h = setup(file, true);
      h.elements.get('#gpsok').checked = true;
      h.state.gpsError = { code, message: 'GPS unavailable in test' };
      await h.sandbox.signup();
      const user = h.DB.users[h.DB.session];
      assert.ok(user, `GPS error ${code} must not block signup`);
      assert.equal(h.state.gpsCalls, 1);
      assert.equal(user.geo, null);
      assert.equal(user.plants[0].geo, null);
      assert.equal(user.gpsAccuracy, null);
      assert.equal(user.plants[0].local, user.end);
      assert.match(user.locNote, /endereço.*manualmente/i);
      assert.equal(h.state.aiCalls, 0);
      assert.equal(h.state.routes.at(-1), 'intro1');
    }
  });

  test(`${file}: insecure contexts keep the manual address without accessing GPS`, async () => {
    const h = setup(file, true);
    h.elements.get('#gpsok').checked = true;
    h.sandbox.window.isSecureContext = false;
    h.state.forbidGPS = true;
    await h.sandbox.signup();
    const user = h.DB.users[h.DB.session];
    assert.ok(user);
    assert.equal(user.geo, null);
    assert.equal(user.plants[0].local, user.end);
    assert.equal(h.state.navigatorReads, 0);
    assert.match(user.locNote, /GPS indisponível/);
  });

  test(`${file}: a signup without CPF carries its address into a new plant, record, and cloud payloads`, async () => {
    const h = setup(file);
    await h.sandbox.signup();
    const user = h.DB.users[h.DB.session];
    assert.equal(Object.hasOwn(user, 'cpf'), false);
    await recordPlant(h);
    const plant = user.plants.find(p => p.projectPlantId === 'planta-1');
    assert.ok(plant);
    assert.equal(plant.local, user.end);
    assert.deepEqual(clean(plant.localCultivo), clean(user.localCultivo));
    assert.equal(plant.geo, null);
    assert.equal(user.regs.length, 1, h.elements.get('#re').textContent);
    assert.equal(user.regs[0].local, user.end);
    assert.equal(user.regs[0].geo, null);
    user.cloudConsent = true;
    h.activateCloud();
    await h.sandbox.syncUser();
    await h.sandbox.syncReg(user.regs[0]);
    assert.equal(h.state.sent.length, 2, h.sandbox.tmp.cloudSyncError);
    const savedUser = h.state.sent[0].contas[user.id], savedRecord = h.state.sent[1];
    assert.equal(Object.hasOwn(savedUser, 'cpf'), false);
    assert.equal(savedUser.local, user.end);
    assert.deepEqual(savedUser.localCultivo, clean(user.localCultivo));
    assert.equal(savedUser.geo, null);
    assert.equal(savedRecord.local, user.end);
    assert.equal(savedRecord.geo, null);
    assert.equal(h.state.navigatorReads, 0);
    assert.equal(h.state.aiCalls, 0);
  });

  test(`${file}: an existing account still logs in with email and password and keeps its stored data`, async () => {
    const h = setup(file), legacy = oldUser();
    h.DB.users.legacy = legacy;
    const original = clean(legacy);
    await h.sandbox.login();
    assert.equal(h.DB.session, 'legacy');
    assert.equal(h.state.routes.at(-1), 'home');
    assert.deepEqual(clean(legacy), original);
    assert.equal(h.state.gpsReads, 0);
    assert.equal(h.state.aiCalls, 0);
  });

  test(`${file}: optional account sync omits CPF and legacy GPS while retaining the manual plant address`, async () => {
    const h = setup(file), legacy = oldUser();
    h.DB.users.legacy = legacy; h.DB.session = 'legacy';
    h.activateCloud();
    await h.sandbox.syncUser();
    assert.equal(h.state.sent.length, 0, 'cloud consent is still required');
    legacy.cloudConsent = true;
    await h.sandbox.syncUser();
    assert.equal(h.state.sent.length, 1, h.sandbox.tmp.cloudSyncError);
    const saved = h.state.sent[0].contas.legacy;
    assert.equal(Object.hasOwn(saved, 'cpf'), false);
    assert.equal(saved.geo, null);
    assert.equal(saved.gpsConsent, false);
    assert.equal(saved.gpsAccuracy, null);
    assert.equal(saved.local, legacy.end);
    assert.equal(saved.plants[0].local, legacy.end);
    assert.equal(JSON.stringify(saved).includes('legacy-cpf-value'), false);
    assert.equal(JSON.stringify(saved).includes('-22.5'), false);
    assert.equal(legacy.gpsConsent, true, 'the disabled feature must not erase existing local records');
    assert.equal(legacy.geo.lat, -22.5);
  });

  test(`${file}: new photo records retain the manual address but never reuse legacy GPS while disabled`, async () => {
    const h = setup(file), legacy = oldUser();
    h.DB.users.legacy = legacy; h.DB.session = 'legacy';
    await recordPlant(h);
    assert.equal(legacy.regs.length, 1, h.elements.get('#re').textContent);
    assert.equal(legacy.regs[0].geo, null);
    const plant = legacy.plants.find(p => p.projectPlantId === 'planta-1');
    assert.ok(plant);
    assert.equal(plant.local, legacy.end);
    assert.equal(legacy.regs[0].local, legacy.end);
    assert.equal(plant.geo, null);
    assert.equal(h.state.gpsReads, 0);
    assert.equal(legacy.geo.lat, -22.5);
  });

  test(`${file}: even when GPS is enabled a plant without coordinates cannot inherit account GPS`, async () => {
    const h = setup(file, true), legacy = oldUser();
    h.DB.users.legacy = legacy; h.DB.session = 'legacy';
    legacy.plants.push({ id: 'projeto_planta-1', projectPlantId: 'planta-1', nome: 'Planta 1',
      local: 'Rua A, 50, Limeira – SP', geo: null });
    await recordPlant(h);
    assert.equal(legacy.regs.length, 1, h.elements.get('#re').textContent);
    assert.equal(legacy.regs[0].geo, null);
    assert.equal(legacy.regs[0].local, 'Rua A, 50, Limeira – SP');
    assert.equal(legacy.geo.lat, -22.5);
    assert.equal(h.state.navigatorReads, 0);
  });

  test(`${file}: syncing an older photo record cannot re-send GPS while disabled`, async () => {
    const h = setup(file), legacy = oldUser();
    legacy.cloudConsent = true;
    h.DB.users.legacy = legacy; h.DB.session = 'legacy';
    h.activateCloud();
    const record = { id: 'record1', ts: 1, obs: 'Plant observation', amigo: '', plant: 'placeholder',
      geo: { lat: -22.5, lng: -47.4, acc: 5 }, qrCode: 'janelaverde:planta-1', qrToken: 'planta-1',
      projectPlantId: 'planta-1', plantName: 'Planta 1', vaseId: 'planta-1', vaseName: 'Planta 1', th: 'thumbnail' };
    await h.sandbox.syncReg(record);
    assert.equal(h.state.sent.length, 1, h.sandbox.tmp.cloudSyncError);
    assert.equal(h.state.sent[0].geo, null);
    assert.equal(h.state.sent[0].local, legacy.plants[0].local);
    assert.equal(record.geo.lat, -22.5);
  });
}
