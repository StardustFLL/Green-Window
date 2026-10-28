const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'Janela Verde (20).html'), 'utf8');
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
const clean = value => JSON.parse(JSON.stringify(value));

function collection() {
  const user = { coll: {}, shots: [], sched: [], pg: {}, pc: {}, plants: [], regs: [], pts: [], char: 'Jardineiro' };
  const sandbox = {
    CFG: {}, V: {}, tmp: {}, U: () => user, window: {}, URL,
    day: value => new Date(value).toISOString().slice(0, 10), fmt: () => 'hoje',
    esc: value => String(value ?? ''), av: () => '<svg></svg>', saldo: () => 0
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'plant-unlocks.js'), 'utf8'), sandbox);
  vm.runInContext(section('/* ===== PLANTAS v2:', '\nwindow.JV_UNLOCKS.capture();'), sandbox);
  return { sandbox, user };
}

test('version 20 loads the shared Firebase files and uses the cloud AI service without recursion', async () => {
  new vm.Script(html.split('<script>').pop().split('</script>')[0]);
  for (const match of html.matchAll(/<script src="([^"]+)"/g)) {
    if (!match[1].startsWith('https:')) assert.ok(fs.existsSync(path.join(root, match[1])), match[1]);
  }
  let calls = 0;
  const sandbox = { claude: { use: async name => {
    assert.equal(name, 'sample');
    return async (prompt, options) => { calls++; return { text: prompt, images: options.images }; };
  } }, _openCall: () => { throw new Error('Cloud provider should have answered'); } };
  vm.createContext(sandbox);
  vm.runInContext(section('function openSample(){', 'window.testarIA='), sandbox);
  const result = await sandbox.openSample()('pergunta', { images: ['foto'] });
  assert.equal(calls, 1);
  assert.equal(result.text, 'pergunta');
  assert.equal(result.images[0], 'foto');
});

test('catalog, collection, goals, agenda and the six catalog IDs survive the integration', () => {
  const { sandbox } = collection();
  const mapping = clean(vm.runInContext('PL.map(p=>[p.id,p.projectPlantId])', sandbox));
  assert.deepEqual(mapping, [
    ['onze', 'planta-1'], ['lambari', 'planta-2'], ['tradescantia', 'planta-3'],
    ['trapoeraba', 'planta-4'], ['capim', 'planta-5'], ['jabuticaba', 'planta-6']
  ]);
  assert.equal(sandbox.V.plants, sandbox.V.coll);
  assert.match(sandbox.V.catalog(), /Catálogo de plantas/);
  assert.match(sandbox.V.coll(), /Minha coleção/);
  assert.match(sandbox.V.jour(), /Agenda/);
  for (const fn of ['syncGoals', 'schAdd', 'schDone', 'openID', 'shotSend']) assert.equal(typeof sandbox[fn], 'function');
});

test('growth includes daily activities by fixed plant ID even while the database name remains numbered', () => {
  const { sandbox, user } = collection();
  user.coll.onze = { ts: 1, qrUnlocked: true, projectPlantId: 'planta-1' };
  user.plants.push({ id: 'projeto_planta-1', nome: 'Planta 1' });
  user.regs.push({ projectPlantId: 'planta-1', plant: 'projeto_planta-1', ts: Date.now(), foto: 'daily-image', obs: 'broto registrado' });
  sandbox.tmp.jt = 2; sandbox.tmp.jp = 'onze';
  const view = sandbox.V.jour();
  assert.match(view, /daily-image/);
  assert.match(view, /broto registrado/);
  assert.match(view, /Onze-horas/);
});

test('photo identification and goal analysis use the same cloud AI adapter', async () => {
  const { sandbox } = collection();
  const prompts = [];
  sandbox.dataBlob = value => value;
  sandbox.aiRetry = fn => fn();
  sandbox.aiParse = JSON.parse;
  sandbox.openSample = () => {
    const sample = async (prompt, options) => {
      prompts.push({ prompt, options });
      return { text: JSON.stringify({ id: 'onze', confianca: 'alta', descricao: 'planta no vaso', planta: true, pessoa: true, vaso: true }) };
    };
    sample.limits = async () => ({ images: true });
    return sample;
  };
  assert.equal((await sandbox.jvID('identification-photo')).id, 'onze');
  assert.equal((await sandbox.jvAI('goal-photo', 'vaso', 'Onze-horas', '')).ok, 1);
  assert.equal(prompts[0].options.images[0], 'identification-photo');
  assert.equal(prompts[1].options.images[0], 'goal-photo');
});

test('collection metadata sync requires consent and excludes original photos and passwords', async () => {
  const { sandbox, user } = collection();
  Object.assign(user, { id: 'u1', nome: 'Aluno', cpf: '', email: '', tel: '', nasc: '', char: 'Aluno', created: 1, consent: 1,
    cloudConsent: false, cloudConsentAt: 1, ph: 'local-password-hash', salt: 'local-salt' });
  user.coll.onze = { ts: 1, src: 'qr', how: 'QR Code', foto: 'large-collection-image', qrUnlocked: true, qrCode: 'janelaverde:planta-1', unlockedAt: 1 };
  user.shots.push({ id: 'shot1', plant: 'onze', kind: 'vaso', ts: 1, foto: 'large-goal-image', ai: true });
  user.sched.push({ id: 'schedule1', plant: 'onze', tipo: 'rega', data: '2026-10-28', done: 0 });
  let reads = 0, saved;
  Object.assign(sandbox, {
    dbh: async () => { reads++; return { id: 'firebase-uid', db: { doc: () => ({
      get: async () => ({ exists: false }), set: async data => { saved = clean(data); }
    }) } }; }, getAv: () => ({}), admX: () => ({}),
    save: () => true, toast: () => {}, go: () => {}
  });
  vm.runInContext(section('async function syncUser(){', 'async function syncReg('), sandbox);
  await sandbox.syncUser(); assert.equal(reads, 0);
  user.cloudConsent = true;
  await sandbox.syncUser();
  assert.equal(saved.contas.u1.colecao.onze.projectPlantId, 'planta-1');
  assert.equal(saved.contas.u1.colecao.onze.qrUnlocked, true);
  assert.equal(saved.contas.u1.colecao.onze.qrCode, 'janelaverde:planta-1');
  assert.equal(saved.contas.u1.fotosMetas[0].projectPlantId, 'planta-1');
  assert.equal(saved.contas.u1.agenda.length, 1);
  const encoded = JSON.stringify(saved);
  for (const local of ['large-collection-image', 'large-goal-image', 'local-password-hash', 'local-salt']) assert.equal(encoded.includes(local), false);
});
