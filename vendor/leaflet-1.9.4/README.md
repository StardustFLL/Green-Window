# Leaflet 1.9.4

Cópia local da versão estável indicada em https://leafletjs.com/download.html.
Origem dos arquivos: https://unpkg.com/leaflet@1.9.4/dist/ e licença em
https://unpkg.com/leaflet@1.9.4/LICENSE. A licença BSD de 2 cláusulas acompanha
esta pasta em `LICENSE`.

Os hashes SHA-256 oficiais foram conferidos antes da inclusão:

- `leaflet.js`: `20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=`
- `leaflet.css`: `p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=`

Somente os arquivos estáticos da biblioteca entram no cache do app. As imagens
do mapa são solicitadas pelo navegador ao OpenStreetMap durante a visualização,
respeitando cache HTTP e Referer normais; não há download de mapas offline.
Fonte: https://operations.osmfoundation.org/policies/tiles/.
