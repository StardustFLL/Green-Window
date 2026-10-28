const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, process.env.JV_HTML_FILE || 'index.html'), 'utf8');

async function adapter() {
  const docs = new Map([['config/admins', { uids: ['admin'] }]]);
  const snapshot = ref => ({ exists: () => docs.has(ref), data: () => docs.get(ref) });
  const store = {
    getFirestore: () => ({}), doc: (_, ...parts) => parts.join('/'),
    getDoc: async ref => snapshot(ref),
    serverTimestamp: () => ({ toMillis: () => 123 }),
    updateDoc: async (ref, data) => docs.set(ref, { ...docs.get(ref), ...data }),
    runTransaction: async (_, callback) => callback({
      get: async ref => snapshot(ref),
      set: (ref, data) => docs.set(ref, data),
      update: (ref, data) => docs.set(ref, { ...docs.get(ref), ...data })
    })
  };
  const sandbox = {
    window: { JV_FIREBASE_CONFIG: { apiKey: 'test', projectId: 'test', appId: 'test' } },
    queueMicrotask, URL,
    location: { href: "https://green.example/Janela%20Verde%20(20).html" },
    document: { currentScript: { src: "https://green.example/qr-links.js" } },
    __import: async url => {
      if (url.endsWith('firebase-app.js')) return { getApps: () => [], initializeApp: () => ({}) };
      if (url.endsWith('firebase-auth.js')) return {
        getAuth: () => ({}), onAuthStateChanged: (_, fn) => { queueMicrotask(() => fn({ uid: 'admin' })); return () => {}; }
      };
      if (url.endsWith('firebase-firestore.js')) return store;
      throw new Error('Unexpected SDK request: ' + url);
    }
  };
  const code = fs.readFileSync(path.join(root, 'Firebase/firebase-adapter.js'), 'utf8').replaceAll('import(', '__import(');
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "qr-links.js"), "utf8"), sandbox);
  vm.runInContext(code, sandbox);
  return { api: await sandbox.window.claude.use('qr-codes'), docs };
}

test('six fixed slots; repeated saves and scans reuse the same document and QR', async () => {
  const { api, docs } = await adapter();
  const slots = await api.list();
  assert.equal(slots.length, 6);
  assert.equal(slots[0].plantName, 'Planta 1');
  assert.equal(await api.lookup('janelaverde:planta-1'), null);
  for (let n = 1; n <= 6; n++) await api.configure('planta-' + n, 'Planta ' + n);
  for (let n = 0; n < 10; n++) assert.equal((await api.scan(n % 2 ? 'https://green.example/instalar.html?planta=planta-1' : 'janelaverde:planta-1')).plantId, 'planta-1');
  const renamed = await api.configure('planta-1', 'Novo nome');
  assert.equal(renamed.code, 'janelaverde:planta-1');
  assert.equal(renamed.scanCount, 10);
  assert.equal([...docs.keys()].filter(k => k.startsWith('plantas/')).length, 6);
  assert.equal([...docs.keys()].some(k => k.startsWith('qrcodes/')), false);
  await assert.rejects(api.configure('planta-7', 'Extra'));
  await assert.rejects(api.configure('planta-1', '  '));
  for (const code of ['janelaverde:planta-7', 'outro:planta-1', 'planta-1', 'janelaverde:' + 'a'.repeat(48), 'https://other.example/instalar.html?planta=planta-1']) {
    assert.equal(await api.scan(code), null);
  }
  await api.revoke('planta-1');
  assert.equal(await api.lookup('janelaverde:planta-1'), null);
  assert.equal(await api.scan('janelaverde:planta-1'), null);
  await api.configure('planta-1', 'Planta 1');
  assert.equal((await api.lookup('janelaverde:planta-1')).code, renamed.code);
  assert.equal(docs.get('plantas/planta-1').scanCount, 10);
});

test('HTML JavaScript parses and repeated local readings do not append duplicate QR entries', () => {
  new vm.Script(html.split('<script>').pop().split('</script>')[0]);
  const user = { qr: [] };
  const code = html.slice(html.indexOf('function recordVaseScan('), html.indexOf('\nfunction handleQR'));
  const sandbox = { U: () => user, save: () => true };
  vm.createContext(sandbox); vm.runInContext(code, sandbox);
  for (let i = 0; i < 10; i++) sandbox.recordVaseScan({ plantId: 'planta-1', plantName: 'Planta 1', code: 'janelaverde:planta-1', token: 'planta-1' });
  assert.equal(user.qr.length, 1);
  assert.equal(user.qr[0].scanCount, 10);
});

test('registrations select the canonical plant ID, even with repeated or identical names', async () => {
  const user = { plants: [], regs: [], pts: [] };
  const nodes = { '#ro': { value: '' }, '#rs': {}, '#re': {}, '#modal': {} };
  const sandbox = {
    tmp: {}, U: () => user, $: key => nodes[key], CFG: { pontosPorDia: 10, pontosPlantaNova: 5 },
    day: () => '2026-10-28', save: () => true, syncReg: () => {}, pubRank: () => {},
    toast: () => {}, go: () => {}, logFoto: () => {},
    verifyVaseQR: async () => sandbox.tmp.qrVase
  };
  const code = html.slice(html.indexOf('async function saveReg(){'), html.indexOf('\nasync function saveRegEdit'));
  vm.createContext(sandbox); vm.runInContext(code, sandbox);
  for (const id of ['planta-1', 'planta-1', 'planta-2']) {
    sandbox.tmp = { qrCode: 'janelaverde:' + id, foto: 'photo', okFoto: 'photo', qrVase: {
      plantId: id, plantName: 'Mesmo nome', token: id, vaseId: id, vaseName: 'Mesmo nome'
    } };
    await sandbox.saveReg();
  }
  assert.equal(user.plants.length, 2);
  assert.equal(user.regs.length, 3);
  assert.equal(user.regs[0].plant, user.regs[1].plant);
  assert.notEqual(user.regs[0].plant, user.regs[2].plant);
  assert.equal(user.regs[2].projectPlantId, 'planta-2');
  assert.equal(user.pts.reduce((sum, point) => sum + point.v, 0), 20);
});
