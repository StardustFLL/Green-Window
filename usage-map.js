/* Mapa restrito da equipe: localização aproximada do município do cultivo.
   Não usa GPS nem envia rua, número, nome ou e-mail a serviços externos.
   Fontes: https://servicodados.ibge.gov.br/api/docs/localidades
           https://servicodados.ibge.gov.br/api/docs/malhas?versao=3 */
(function () {
  'use strict';
  const API = 'https://servicodados.ibge.gov.br/api';
  const CACHE_KEY = 'jv_usage_municipios_v1';
  const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
  const REQUEST_TIMEOUT = 15000;
  const STATES = { AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53,
    ES: 32, GO: 52, MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25,
    PR: 41, PE: 26, PI: 22, RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14,
    SC: 42, SP: 35, SE: 28, TO: 17 };
  const centers = new Map(), states = new Map(), pending = new Map();
  const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const keyFor = (city, uf) => uf + ':' + normalize(city);
  const validId = (id, uf) => /^\d{7}$/.test(String(id)) && String(id).startsWith(String(STATES[uf]));
  const validPosition = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && p.lat >= -35 && p.lat <= 6 && p.lng >= -75 && p.lng <= -28;

  function parseLocation(row) {
    if (!row || typeof row !== 'object') return null;
    let address, city, uf;
    const location = row.localCultivo;
    if (location && typeof location === 'object') {
      address = location.endereco; city = location.cidade; uf = location.uf;
    } else {
      // O cadastro anterior já salvava "rua, número, cidade – UF".
      const full = typeof row.local === 'string' ? row.local : typeof row.end === 'string' ? row.end : '';
      const match = full.match(/^(.*),\s*([^,]+?)\s*[–—-]\s*([A-Za-z]{2})\s*$/);
      if (!match) return null;
      [, address, city, uf] = match;
    }
    if (typeof address !== 'string' || typeof city !== 'string' || typeof uf !== 'string') return null;
    address = address.trim(); city = city.trim().replace(/\s+/g, ' '); uf = uf.trim().toUpperCase();
    // Cidade ou coordenadas isoladas não constituem um endereço cadastrado.
    if (address.length < 4 || !/[\p{L}]/u.test(address)
      || !/\d|\bs\s*\/?\s*n\b|sem n[uú]mero/i.test(address)
      || normalize(city).length < 2 || !Object.hasOwn(STATES, uf)) return null;
    return { cidade: city, uf, endereco: address };
  }

  function readCache() {
    try {
      const disk = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!disk || disk.version !== 1 || !Array.isArray(disk.entries)) return;
      for (const item of disk.entries.slice(0, 6000)) {
        if (!item || !Object.hasOwn(STATES, item.uf) || typeof item.city !== 'string'
          || !validId(item.id, item.uf) || !validPosition(item)
          || !Number.isFinite(item.at) || item.at > Date.now() || Date.now() - item.at > CACHE_TTL) continue;
        centers.set(keyFor(item.city, item.uf), { city: item.city, uf: item.uf,
          id: String(item.id), lat: item.lat, lng: item.lng, at: item.at });
      }
    } catch (_) { /* O mapa também funciona com armazenamento bloqueado. */ }
  }
  function writeCache() {
    try {
      const entries = [...centers.values()].filter(item => Date.now() - item.at <= CACHE_TTL).slice(-6000);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 1, entries }));
    } catch (_) {}
  }
  readCache();

  async function getJSON(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const response = await fetch(url, { signal: controller.signal,
        credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('IBGE indisponível (' + response.status + ').');
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function municipalities(uf) {
    if (!states.has(uf)) {
      const request = getJSON(API + '/v1/localidades/estados/' + uf + '/municipios')
        .then(items => {
          if (!Array.isArray(items)) throw new Error('Lista de municípios inválida.');
          return items.filter(item => item && typeof item.nome === 'string' && validId(item.id, uf))
            .map(item => ({ id: String(item.id), nome: item.nome }));
        });
      states.set(uf, request);
      request.catch(() => { if (states.get(uf) === request) states.delete(uf); });
    }
    return states.get(uf);
  }

  function ringArea(ring) {
    let area = 0, x = 0, y = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], cross = a[0] * b[1] - b[0] * a[1];
      area += cross; x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross;
    }
    return { area: Math.abs(area / 2), center: Math.abs(area) > 1e-12 ? [x / (3 * area), y / (3 * area)] : null };
  }
  function insideRing(point, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > point[1]) !== (b[1] > point[1])
        && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function insidePolygon(point, polygon) {
    return insideRing(point, polygon[0]) && !polygon.slice(1).some(ring => insideRing(point, ring));
  }
  function polygonCenter(polygon) {
    const result = ringArea(polygon[0]);
    if (!result.center || !result.area) return null;
    if (insidePolygon(result.center, polygon)) return { center: result.center, area: result.area };
    // Um centroide pode cair fora de um município côncavo ou dentro de um lago.
    // Nesse caso escolhemos um ponto interior da maior faixa horizontal.
    const ys = polygon[0].map(point => point[1]), min = Math.min(...ys), max = Math.max(...ys);
    let best = null, width = 0;
    for (let row = 1; row < 16; row++) {
      const y = min + (max - min) * row / 16, intersections = [];
      for (const ring of polygon) for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if ((a[1] > y) !== (b[1] > y)) intersections.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i++) {
        const left = intersections[i], right = intersections[i + 1], candidate = [(left + right) / 2, y];
        if (right - left > width && insidePolygon(candidate, polygon)) { best = candidate; width = right - left; }
      }
    }
    return best ? { center: best, area: result.area } : null;
  }
  function geometryCenter(data, expectedId) {
    const features = data?.type === 'FeatureCollection' ? data.features : data?.type === 'Feature' ? [data] : [];
    if (!Array.isArray(features)) return null;
    const polygons = [];
    for (const feature of features) {
      const codarea = feature?.properties?.codarea;
      if (codarea != null && String(codarea) !== expectedId) continue;
      const geometry = feature?.geometry;
      if (geometry?.type === 'Polygon') polygons.push(geometry.coordinates);
      else if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) polygons.push(...geometry.coordinates);
    }
    const candidates = [];
    for (const polygon of polygons) {
      if (!Array.isArray(polygon) || !polygon.length || polygon.some(ring => !Array.isArray(ring) || ring.length < 4
        || ring.some(point => !Array.isArray(point) || !validPosition({ lng: point[0], lat: point[1] })))) continue;
      const candidate = polygonCenter(polygon);
      if (candidate) candidates.push(candidate);
    }
    candidates.sort((a, b) => b.area - a.area);
    const point = candidates[0]?.center;
    return point ? { lng: point[0], lat: point[1] } : null;
  }

  async function locate(location) {
    const key = keyFor(location.cidade, location.uf), cached = centers.get(key);
    if (cached && Date.now() - cached.at <= CACHE_TTL) return cached;
    if (pending.has(key)) return pending.get(key);
    const request = (async () => {
      const items = await municipalities(location.uf);
      const city = items.find(item => normalize(item.nome) === normalize(location.cidade));
      if (!city) return null;
      const geometry = await getJSON(API + '/v3/malhas/municipios/' + city.id
        + '?formato=application%2Fvnd.geo%2Bjson&qualidade=minima');
      const position = geometryCenter(geometry, city.id);
      if (!position) throw new Error('Malha do município inválida.');
      const result = { city: city.nome, uf: location.uf, id: city.id, ...position, at: Date.now() };
      centers.set(key, result); writeCache();
      return result;
    })();
    pending.set(key, request);
    try { return await request; }
    finally { if (pending.get(key) === request) pending.delete(key); }
  }

  async function resolve(rows, options = {}) {
    if (!Array.isArray(rows)) return [];
    const groups = new Map(), points = [];
    rows.forEach((row, i) => {
      const location = parseLocation(row);
      if (!location) return;
      const key = keyFor(location.cidade, location.uf);
      if (!groups.has(key)) groups.set(key, { location, indices: [] });
      groups.get(key).indices.push(i);
    });
    const work = [...groups.values()], total = work.reduce((sum, group) => sum + group.indices.length, 0);
    let cursor = 0, processed = 0;
    const report = () => {
      try { options.onProgress?.({ total, processed, resolved: points.length,
        unresolved: processed - points.length, points: [...points].sort((a, b) => a.i - b.i) }); } catch (_) {}
    };
    report();
    async function worker() {
      while (cursor < work.length) {
        const group = work[cursor++];
        try {
          const center = await locate(group.location);
          if (center) for (const i of group.indices) points.push({ i, lat: center.lat, lng: center.lng,
            city: center.city, uf: center.uf, municipioId: center.id, precision: 'municipio' });
        } catch (_) { /* Endereços não localizados ficam sem ponto e podem ser tentados novamente. */ }
        processed += group.indices.length; report();
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, work.length) }, worker));
    return points.sort((a, b) => a.i - b.i);
  }
  function clearCache() {
    centers.clear(); states.clear();
    try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
  }
  window.JV_USAGE_MAP = Object.freeze({ parseLocation, resolve, clearCache, precision: 'municipio' });
})();
