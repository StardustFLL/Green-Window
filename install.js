(function () {
  'use strict';
  const links = window.JV_QR_LINKS;
  const release = '?v=' + encodeURIComponent(links.release);
  const url = new URL(location.href), plantId = links.entry(url);
  const status = document.querySelector('#install-status');
  const open = document.querySelector('#open-app');
  const button = document.querySelector('#install-button');
  let promptEvent;
  document.querySelector('#app-manifest').href = (plantId ? 'manifest-' + plantId + '.webmanifest' : 'manifest.webmanifest') + release;
  if (url.searchParams.has('planta') && !plantId) {
    document.querySelector('#plant-message').textContent = 'Este link não corresponde a uma das seis plantas do projeto. Abra o aplicativo para escanear um QR oficial.';
    document.querySelector('#plant-message').classList.add('error');
    try { links.clear(); } catch (_) {}
  } else if (plantId) {
    document.querySelector('#plant-label').textContent = 'QR recebido · Planta ' + plantId.slice(-1);
    document.querySelector('#plant-message').textContent = 'Ao entrar no aplicativo, o QR da Planta ' + plantId.slice(-1) + ' será validado no Firestore. Somente essa planta será desbloqueada.';
    document.querySelector('#app-manifest').href = 'manifest-' + plantId + '.webmanifest' + release;
    try { links.remember(plantId); } catch (_) { /* O link do aplicativo também preserva o ID. */ }
  }
  open.href = links.appUrl(plantId);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); promptEvent = event; button.hidden = false;
    status.textContent = 'Pronto para instalar neste dispositivo.';
  });
  button.onclick = async () => {
    if (!promptEvent) return;
    button.disabled = true;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      status.textContent = choice.outcome === 'accepted' ? 'Instalação solicitada. Abra o aplicativo para continuar.' : 'Você pode instalar depois ou continuar pelo navegador.';
    } catch (_) { status.textContent = 'Use a opção de instalar no menu do navegador.'; }
    finally { promptEvent = null; button.hidden = true; button.disabled = false; }
  };
  window.addEventListener('appinstalled', () => { button.hidden = true; status.textContent = 'Aplicativo instalado. Abra-o e entre na sua conta para continuar.'; });
  if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) status.textContent = 'O aplicativo já está aberto no modo instalado. Continue pelo botão acima.';
  if ('serviceWorker' in navigator && ['https:', 'http:'].includes(location.protocol)) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(registration => {
      if (typeof registration.update === 'function') registration.update().catch(() => {});
    }).catch(() => { status.textContent = 'A instalação não ficou disponível agora. Você pode abrir o app no navegador.'; });
  }
})();
