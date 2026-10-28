const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../usage-map.js'), 'utf8');
const clean = value => JSON.parse(JSON.stringify(value));
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function setup(fetcher, disk = storage()) {
  const requests = [];
  const sandbox = { window: {}, localStorage: disk, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => { requests.push({ url, options }); return fetcher(url, options); } };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  return { api: sandbox.window.JV_USAGE_MAP, requests, disk };
}
const response = data => ({ ok: true, json: async () => data });
const list = [{ id: 3526902, nome: 'Limeira' }, { id: 3501608, nome: 'Americana' }, { id: 3550308, nome: 'São Paulo' }];
const shape = (id = '3526902', geometry = { type: 'Polygon', coordinates: [[[-48, -23], [-46, -23], [-46, -21], [-48, -21], [-48, -23]]] }) =>
  ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { codarea: id }, geometry }] });
const account = (city = 'Limeira', uf = 'SP') => ({ nome: 'Nome que não deve sair', email: 'sigilo@example.test',
  localCultivo: { endereco: 'Rua Privada das Flores, 120', cidade: city, uf } });
function goodService(url) {
  if (url.includes('/localidades/estados/SP/municipios')) return response(list);
  const id = url.match(/\/malhas\/municipios\/(\d+)/)?.[1];
  if (id) return response(shape(id));
  throw new Error('Unexpected URL: ' + url);
}

test('usage map accepts only an address with city and valid UF, supporting old registrations', () => {
  const { api } = setup(() => { throw new Error('Parsing cannot fetch'); });
  assert.deepEqual(clean(api.parseLocation(account())), { cidade: 'Limeira', uf: 'SP', endereco: 'Rua Privada das Flores, 120' });
  assert.deepEqual(clean(api.parseLocation({ local: 'Avenida do Projeto, 20, Biritiba-Mirim - sp' })),
    { endereco: 'Avenida do Projeto, 20', cidade: 'Biritiba-Mirim', uf: 'SP' });
  assert.equal(api.parseLocation({ end: 'Escola Municipal, s/n, Limeira – SP' }).cidade, 'Limeira');
  for (const row of [null, {}, { geo: { lat: -22, lng: -47 } }, { local: 'Limeira – SP' },
    { local: ', Limeira – SP' }, { local: 'Rua, Limeira – SP' }, { local: 'Rua das Flores, 120, Limeira – ZZ' },
    { localCultivo: { endereco: '', cidade: 'Limeira', uf: 'SP' } },
    { localCultivo: { endereco: 'Rua das Flores, 120', cidade: '', uf: 'SP' } }]) assert.equal(api.parseLocation(row), null);
});

test('an empty map never requests location services or reuses GPS coordinates', async () => {
  const { api, requests } = setup(() => { throw new Error('No address, no network'); });
  assert.deepEqual(clean(await api.resolve([])), []);
  assert.deepEqual(clean(await api.resolve([{ geo: { lat: -22, lng: -47 } }, { local: '' }])), []);
  assert.deepEqual(clean(await api.resolve(null)), []);
  assert.equal(requests.length, 0);
});

test('only official municipality identifiers reach the geometry API; repeated cities share requests', async () => {
  const { api, requests } = setup(goodService);
  const rows = [account(), { local: 'Rua Outra, 500, limeira – SP' }, { geo: { lat: -22, lng: -47 } }];
  const points = clean(await api.resolve(rows));
  assert.equal(points.length, 2); assert.deepEqual(points.map(point => point.i), [0, 1]);
  assert.equal(points[0].municipioId, '3526902'); assert.equal(points[0].precision, 'municipio');
  assert.ok(Math.abs(points[0].lat + 22) < 1e-8); assert.ok(Math.abs(points[0].lng + 47) < 1e-8);
  assert.equal(requests.length, 2);
  for (const { url, options } of requests) {
    assert.match(url, /^https:\/\/servicodados\.ibge\.gov\.br\/api\//);
    for (const sensitive of ['Privada', 'Flores', '120', '500', 'sigilo', 'Nome', 'example.test']) assert.equal(url.includes(sensitive), false);
    assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer');
  }
});

test('a municipality cache survives reload without storing any participant or street address', async () => {
  const first = setup(goodService);
  await first.api.resolve([account()]);
  const saved = first.disk.getItem('jv_usage_municipios_v1');
  for (const sensitive of ['Privada', 'Flores', '120', 'sigilo', 'Nome que', 'example.test', 'endereco', 'email']) assert.equal(saved.includes(sensitive), false);
  const second = setup(() => { throw new Error('Must use the municipal cache'); }, first.disk);
  const points = await second.api.resolve([account()]);
  assert.equal(points.length, 1); assert.equal(second.requests.length, 0);
  await second.api.resolve([]); assert.equal(second.requests.length, 0);
});

test('different municipalities share their UF list and report partial progress without personal data', async () => {
  const { api, requests } = setup(goodService), progress = [];
  const result = clean(await api.resolve([account('São Paulo'), account('Limeira'), account('Americana')],
    { onProgress: value => progress.push(clean(value)) }));
  assert.deepEqual(result.map(point => point.i), [0, 1, 2]);
  assert.equal(requests.filter(request => request.url.includes('/localidades/')).length, 1);
  assert.equal(requests.filter(request => request.url.includes('/malhas/')).length, 3);
  assert.equal(progress.at(-1).processed, 3); assert.equal(progress.at(-1).resolved, 3);
  assert.equal(progress.at(-1).unresolved, 0);
  assert.equal(JSON.stringify(progress).includes('Privada'), false);
});

test('a network failure produces no fictitious point and a later retry can recover', async () => {
  let offline = true;
  const { api } = setup(url => { if (offline) throw new Error('Network offline'); return goodService(url); });
  const rows = [{ ...account(), geo: { lat: -10, lng: -50 } }];
  assert.deepEqual(clean(await api.resolve(rows)), []);
  offline = false;
  const points = await api.resolve(rows);
  assert.equal(points.length, 1); assert.notEqual(points[0].lat, -10);
});

test('unrecognized cities and malformed municipality IDs never request a guessed geometry', async () => {
  const { api, requests } = setup(() => response([{ id: '3304557', nome: 'Limeira' }, { id: '../3526902', nome: 'Limeira' }]));
  assert.deepEqual(clean(await api.resolve([account(), account('Cidade que não existe')])), []);
  assert.equal(requests.length, 1); assert.match(requests[0].url, /\/localidades\//);
});

test('malformed, mismatched and out-of-Brazil geometry produces no marker or persisted position', async () => {
  for (const invalid of [null, { type: 'FeatureCollection', features: [] }, shape('3550308'),
    shape('3526902', { type: 'Polygon', coordinates: [[[10, 50], [11, 50], [11, 51], [10, 50]]] }),
    shape('3526902', { type: 'Polygon', coordinates: [[[-47, null], [-46, -22], [-47, -23], [-47, null]]] })]) {
    const { api, disk } = setup(url => url.includes('/localidades/') ? response(list) : response(invalid));
    assert.deepEqual(clean(await api.resolve([account()])), []);
    assert.equal(disk.getItem('jv_usage_municipios_v1'), null);
  }
});

test('one unavailable municipality does not hide other mapped registrations', async () => {
  const { api } = setup(url => {
    if (url.includes('/localidades/')) return response(list);
    if (url.includes('3501608')) return { ok: false, status: 503 };
    return goodService(url);
  });
  const points = clean(await api.resolve([account('Americana'), account('Limeira')]));
  assert.equal(points.length, 1); assert.equal(points[0].i, 1);
});

test('the chosen municipal point lies on the main polygon rather than an offshore part or hole', async () => {
  const main = [[[-48, -23], [-46, -23], [-46, -21], [-48, -21], [-48, -23]],
    [[-47.3, -22.3], [-46.7, -22.3], [-46.7, -21.7], [-47.3, -21.7], [-47.3, -22.3]]];
  const island = [[[-32.5, -4], [-32.49, -4], [-32.49, -3.99], [-32.5, -4]]];
  const { api } = setup(url => url.includes('/localidades/') ? response(list) : response(shape('3526902',
    { type: 'MultiPolygon', coordinates: [island, main] })));
  const [point] = await api.resolve([account()]);
  assert.ok(point.lng > -48 && point.lng < -46 && point.lat > -23 && point.lat < -21);
  assert.equal(point.lng > -47.3 && point.lng < -46.7 && point.lat > -22.3 && point.lat < -21.7, false);
});

test('invalid or expired persisted coordinates are ignored instead of becoming map points', async () => {
  const disk = storage();
  disk.setItem('jv_usage_municipios_v1', JSON.stringify({ version: 1, entries: [
    { city: 'Limeira', uf: 'SP', id: '3526902', lat: 60, lng: 100, at: Date.now() },
    { city: 'Limeira', uf: 'SP', id: '3526902', lat: -22, lng: -47, at: 1 }
  ] }));
  const { api, requests } = setup(goodService, disk);
  assert.equal((await api.resolve([account()])).length, 1);
  assert.equal(requests.length, 2);
});
