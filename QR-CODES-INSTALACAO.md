# QR Codes para instalar o Janela Verde e desbloquear plantas

Os seis links abaixo abrem a página de instalação e levam à versão atual em
`index.html`. A publicação `20261028-4` reúne catálogo por QR, cadastro sem CPF,
GPS desativado, cabelos corrigidos e mapa administrativo detalhado. `Janela Verde (20).html` mantém o mesmo
conteúdo para preservar acessos anteriores.

## Links de acesso atualizados

O parâmetro `v` identifica a publicação e evita reutilizar o endereço que estava
em cache. O ID `planta` mantém o vínculo com a mesma planta no Firestore.
Também há uma lista pronta para copiar/importar em [QR-LINKS-ATUAIS.csv](QR-LINKS-ATUAIS.csv).

| Planta | Espécie no catálogo | Conteúdo do QR atualizado |
|---|---|---|
| `planta-1` | Onze-horas | `https://stardustfll.github.io/Green-Window/instalar.html?planta=planta-1&v=20261028-4` |
| `planta-2` | Lambari-roxo | `https://stardustfll.github.io/Green-Window/instalar.html?planta=planta-2&v=20261028-4` |
| `planta-3` | Tradescantia | `https://stardustfll.github.io/Green-Window/instalar.html?planta=planta-3&v=20261028-4` |
| `planta-4` | Trapoeraba | `https://stardustfll.github.io/Green-Window/instalar.html?planta=planta-4&v=20261028-4` |
| `planta-5` | Capim-limão | `https://stardustfll.github.io/Green-Window/instalar.html?planta=planta-5&v=20261028-4` |
| `planta-6` | Jabuticaba | `https://stardustfll.github.io/Green-Window/instalar.html?planta=planta-6&v=20261028-4` |

A página é a mesma (`instalar.html`); o parâmetro `planta` identifica qual planta
deve ser liberada. Não faça seis QR Codes com um link totalmente idêntico, pois
isso eliminaria a identificação da planta.

## Como gerar as imagens

1. Copie o link completo de uma planta, incluindo `planta` e `v`.
2. Use esse link no campo de URL/texto de um gerador de QR Code.
3. Salve a imagem e identifique a etiqueta com o nome/ID da planta.
4. Teste em outro celular: deve abrir a página de instalação e levar o ID correto
   para o app. No primeiro acesso, entre/crie conta para concluir o desbloqueio.

O painel administrativo do app também mostra os seis links completos e permite
imprimir os QR Codes. Em um endereço local (`127.0.0.1`/`localhost`), o painel
informa que os links são apenas de teste e impede imprimir etiquetas definitivas.

## Relação com o Firestore

Os documentos existentes `plantas/planta-1` até `plantas/planta-6` continuam válidos.
Não é preciso substituir o campo `code` por uma URL no banco.

- `plantId`: ID estável, por exemplo `planta-1`.
- `code`: identificador interno validado pelo app, por exemplo `janelaverde:planta-1`.
- Conteúdo da imagem QR: link HTTPS da instalação, com `?planta=planta-1`.
- `active`: precisa ser `true` para que uma nova leitura possa liberar a planta.

O adapter reconhece o link oficial de instalação, confere o documento ativo e usa
o identificador interno nas atividades. Links de outros sites, plantas fora de
1 a 6 e códigos desativados são recusados. QR Codes copiados continuam tendo o
mesmo valor e representando a mesma planta.

Por padrão, o painel calcula os links usando o endereço do próprio site. Para
usar uma página pública específica, preencha `installPageUrl` em
`Firebase/firebase-config.js` com a URL HTTPS completa de `instalar.html`.

## Regras do catálogo

- As seis plantas começam bloqueadas, inclusive a Jabuticaba.
- Cada QR desbloqueia somente a planta correspondente para a conta local em uso.
- Concluir metas ou identificar uma foto não desbloqueia outras plantas.
- Dados antigos de fotos e metas são preservados, mas os cuidados e a jornada da
  planta exigem um desbloqueio por QR nesta nova versão.
- O QR recebido antes do cadastro/login fica pendente até a pessoa entrar.
- Falha na validação ou na gravação local mantém a planta bloqueada e permite tentar de novo.
- Os desbloqueios acompanham os metadados da coleção na sincronização opcional;
  o sistema de contas do app continua local ao navegador, como antes.

## Instalação como aplicativo Web

A página oferece instalação como PWA quando o navegador disponibilizar essa
opção, além das instruções para adicionar à tela inicial e da opção de abrir no
navegador. Não é um APK nem uma publicação em loja de aplicativos.

Os seis manifestos específicos mantêm a mesma identidade de aplicativo e levam
o ID da planta no primeiro lançamento. Se o dispositivo separar os dados do
navegador e do app instalado ou abrir outra janela, o usuário pode escanear a
mesma etiqueta dentro do app. O desbloqueio precisa de internet para validação.

Referências de implementação: [instalação de PWAs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable),
[URL de lançamento](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/start_url)
e [identidade do aplicativo](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id).

## Arquivos necessários para a publicação

- `instalar.html`, `install.js`, `qr-links.js`.
- `app-features.js`, `usage-map.js`, `admin-map.js`, `avatar-hair.js` e `vendor/leaflet-1.9.4/`.
- `Janela Verde (20).html`, `plant-unlocks.js`, `pwa-boot.js`.
- `manifest.webmanifest` e `manifest-planta-1.webmanifest` até `manifest-planta-6.webmanifest`.
- `sw.js` e a pasta `assets/icons/`.
- `Firebase/firebase-config.js` e `Firebase/firebase-adapter.js`.

O service worker guarda somente arquivos estáticos locais; não guarda respostas
da autenticação ou do Firestore. A nova estratégia usa os documentos e as regras
já existentes no banco, sem apagar dados ou habilitar faturamento.

## Compatibilidade e atualização

Os links anteriores de `instalar.html?planta=planta-N` continuam aceitos; o banco
não precisa de novos documentos nem de alteração do campo `code`. Os novos links
usam a versão no endereço; não é preciso apagar contas, fotos ou dados do navegador.
O site principal e o arquivo da versão 20 carregam o mesmo app. Os manifestos
mantêm a identidade do aplicativo instalado e iniciam em `index.html`.

O service worker usa um cache da nova publicação e revalida arquivos pela rede.
A atualização remove somente os caches antigos do próprio app, preservando dados
locais de contas e autenticação. Ao abrir um dos novos links pela primeira vez,
use uma conexão com internet para receber a publicação.
