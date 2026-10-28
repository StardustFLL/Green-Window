/* Catálogo da versão 20: uma validação de QR libera somente a planta correspondente. */
(function () {
  'use strict';
  let memoryPending = null, busy = false, failedKey = '';
  const links = () => window.JV_QR_LINKS;
  const findPlant = id => PL.find(p => p.projectPlantId === id);
  function locked(user, plant) {
    const entry = user?.coll?.[plant?.id];
    return !plant || entry?.qrUnlocked !== true || entry.projectPlantId !== plant.projectPlantId;
  }
  function grant(row, account = DB.session) {
    const user = U(), plant = findPlant(row?.plantId);
    if (!user || DB.session !== account || !plant || row.active !== true || row.code !== links().code(row.plantId)) return null;
    if (!locked(user, plant)) return plant;
    const previous = user.coll[plant.id], previousGoals = user.pg[plant.id];
    user.coll[plant.id] = { ...previous, ts: previous?.ts || Date.now(), src: 'qr', how: 'QR Code',
      qrUnlocked: true, projectPlantId: row.plantId, qrCode: row.code, unlockedAt: Date.now() };
    user.pg[plant.id] = previousGoals || {};
    if (!save()) {
      if (previous) user.coll[plant.id] = previous; else delete user.coll[plant.id];
      if (previousGoals) user.pg[plant.id] = previousGoals; else delete user.pg[plant.id];
      return null;
    }
    return plant;
  }
  function scan(expectedId) {
    if (!U()) return go('login');
    const account = DB.session;
    scanCam('Escaneie o QR da planta para desbloquear', async raw => {
      const api = await claude.use('qr-codes');
      if (!api) throw new Error('Serviço de QR indisponível.');
      const row = await api.lookup(raw);
      if (!row || (expectedId && row.plantId !== expectedId)) return null;
      return api.scan(raw);
    }, (_, row) => {
      const plant = grant(row, account);
      if (!plant) return toast('Não consegui salvar o desbloqueio. Confira sua conta e o espaço do aparelho.');
      recordVaseScan(row); $('#modal').innerHTML = ''; go('catalog'); infoPlant(plant.id);
      toast(plant.nome + ' desbloqueada pelo QR Code!');
    }, () => { $('#modal').innerHTML = ''; });
  }
  function pending() { return memoryPending || links().pending(); }
  function capture() {
    const url = new URL(location.href);
    if (!url.searchParams.has('planta')) return;
    const id = links().entry(url);
    if (!id) {
      memoryPending = null;
      try { links().clear(); } catch (_) {}
      tmp.pendingUnlockError = 'O link não corresponde a uma das seis plantas.'; return;
    }
    memoryPending = id;
    try { links().remember(id); } catch (_) { /* A consulta da URL continua disponível nesta sessão. */ }
  }
  function clear(id) {
    if (pending() !== id) return;
    memoryPending = null;
    try { links().clear(); } catch (_) {}
    const url = new URL(location.href);
    if (links().entry(url) === id) { url.searchParams.delete('planta'); history.replaceState(null, '', url); }
  }
  function banner() {
    const id = pending();
    if (!id && !tmp.pendingUnlockError) return '';
    const message = tmp.pendingUnlockError || ('QR da Planta ' + id.slice(-1) + ' recebido. ' + (U() ? 'Vamos conferir e desbloquear esta planta.' : 'Entre ou crie sua conta para desbloquear esta planta.'));
    return '<div class="card" role="status"><p id="pending-plant-message">' + esc(message) + '</p>' +
      (tmp.pendingUnlockError && id && U() ? '<button class="btn sec" onclick="window.JV_UNLOCKS.retry()">Tentar validar novamente</button>' : '') + '</div>';
  }
  async function process() {
    const id = pending(), user = U(), account = DB.session;
    if (!id || !user || busy || failedKey === account + '/' + id) return;
    const plant = findPlant(id);
    if (!plant) return;
    if (!locked(user, plant)) { clear(id); tmp.pendingUnlockError = ''; render(); return; }
    busy = true;
    try {
      const api = await claude.use('qr-codes');
      const row = api && await api.scan(links().code(id));
      if (DB.session !== account) return;
      if (!row) throw new Error('QR não cadastrado ou desativado.');
      if (!grant(row, account)) throw new Error('Não foi possível salvar o desbloqueio neste aparelho.');
      recordVaseScan(row); clear(id); tmp.pendingUnlockError = ''; failedKey = '';
      toast(plant.nome + ' desbloqueada pelo QR Code!');
    } catch (_) {
      if (DB.session === account) {
        failedKey = account + '/' + id;
        tmp.pendingUnlockError = 'Não consegui validar o QR. Confira a internet e se o código está ativo; a planta continua bloqueada.';
      }
    } finally { busy = false; render(); }
  }
  window.JV_UNLOCKS = Object.freeze({ locked, grant, scan, capture, banner, process,
    retry() { failedKey = ''; tmp.pendingUnlockError = ''; return process(); } });
})();
