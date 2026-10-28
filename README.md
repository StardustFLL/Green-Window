# 🌿 Janela Verde

App web de jardinagem e biodiversidade da equipe **STARDUST – SESI 005 Limeira**: cadastro com endereço de cultivo da planta, leitura de QR Code do vaso, registro diário de plantas com foto (validada por IA), pontos, ranking, avatar, recompensas, assistente **Green AI** e painel do administrador.

É um app web estático, sem etapa de build; o site publicado está em `index.html`.

## Estrutura do projeto

| Arquivo | Para quê |
|---|---|
| `index.html` | Entrada oficial: versão atual completa do app |
| `Janela Verde (20).html` | Mesmo conteúdo do index, preservado para links anteriores |
| `app-features.js` | Chave reversível do GPS, desativado por padrão |
| `usage-map.js` | Mapa administrativo por município, sem GPS |
| `Firebase/firebase-config.js` | Configuração pública do app Web Firebase e chave pública do App Check |
| `Firebase/firebase-adapter.js` | Autenticação anônima, Firestore e chamada da função de IA |
| `Firebase/firestore.rules` | Regras de acesso ao Firestore |
| `Firebase/functions/` | Função de IA com busca web |
| `firebase.json` | Configuração de deploy do Firebase CLI |

## Publicar (GitHub Pages)

1. No repositório: **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
2. O app fica em `https://SEU-USUARIO.github.io/SEU-REPO/`.

Na Web, o app usa Firebase AI Logic com Gemini como provedor principal para a Green AI e as análises de IA. Se o serviço em nuvem estiver indisponível ou ainda não tiver sido ativado no Firebase, o app mantém os provedores alternativos atuais.

## Dados e sincronização

- O site funciona sem Firebase: os dados permanecem no `localStorage` do navegador.
- A sincronização para o Firestore é opcional. A pessoa escolhe no cadastro ou em **Perfil → Privacidade**; não começa sem essa escolha.
- Com autorização, o app envia nome, e-mail, telefone, nascimento, endereço de cultivo, perfil, plantas, observações, pontos, resgates, QR Codes e registros. O cadastro não solicita CPF. As fotos de registro são enviadas como cópias JPEG reduzidas; o app mantém a cópia de 600 px localmente e não envia a imagem de origem. Senha, hash e sal não são enviados.
- O app pode ler configurações e ranking públicos com uma identidade anônima do Firebase; gravações do cadastro e das atividades só são feitas após o consentimento opcional. As contas e senhas do Janela Verde continuam locais: entrar na conta local em outro aparelho não recupera automaticamente os dados do primeiro.
- O documento `cadastros/{uid}` contém o campo `contas`; registros/fotos ficam em `cadastros/{uid}/regs`; o ranking contém apenas personagem, avatar e pontuação.
- O projeto usa seis plantas fixas. Cada documento `plantas/planta-1` até `plantas/planta-6` mantém um identificador interno (`janelaverde:planta-N`). Os novos QR Codes contêm links para `instalar.html?planta=planta-N`: todos abrem a mesma instalação, cada um libera somente sua planta na versão 20 após validação no Firestore. O catálogo inteiro começa bloqueado; fotos e metas não substituem o QR. Veja [os links e a preparação da instalação](QR-CODES-INSTALACAO.md) e o [guia do banco](Firebase/GUIA-SEIS-PLANTAS.md).
- Desativar a sincronização interrompe novos envios. Cópias que já chegaram ao Firestore continuam armazenadas; a remoção precisa ser feita pela equipe administradora.
- O chat não é gravado no Firestore. A pergunta atual e até seis mensagens recentes são enviadas ao provedor de IA. Não inclua CPF, endereço ou outros dados pessoais na conversa.

## Configurar o Firebase

Em 28/10/2026, a conexão com o banco real `greenwindow` foi confirmada pelo
navegador: seis plantas cadastradas, regras atualizadas ativas, autenticação
anônima, leitura e gravação testadas e QR incorreto recusado. O registro técnico
foi removido após a verificação. Consulte `Firebase/conexao.html` no mesmo
servidor do app para repetir os testes. A configuração da IA é separada.

1. O app está conectado ao projeto `green-window-71c2c` e ao banco nomeado `greenwindow`. Confirme no Firebase Console que esse banco existe; não use `(default)` para este app.
2. Habilite o provedor **Anônimo** em **Authentication → Sign-in method** e registre o domínio do site em **Authentication → Settings → Authorized domains**.
3. `Firebase/firebase-config.js` contém a configuração pública do app Web. Essa configuração não é uma credencial secreta; proteja os dados com as regras do Firestore e restrinja a chave de API conforme os domínios e APIs usados.
4. Em **AI Services → AI Logic**, habilite o **Gemini Developer API** para o app Web. O app usa o modelo `gemini-3.8-flash` pela SDK do Firebase AI Logic. Registre um provedor Web no **Firebase App Check** e copie a site key para `appCheckSiteKey`. O app não contém uma chave Gemini.
5. O `firebase.json` associa `Firebase/firestore.rules` ao banco `greenwindow`. Instale o Firebase CLI (`npm install -g firebase-tools`), autentique com `firebase login`, selecione o projeto com `firebase use --add` e, na raiz do repositório, publique as regras: `firebase deploy --only firestore:rules`.
6. Para liberar o painel administrador, abra o site uma vez, copie o UID anônimo em **Authentication → Users** e crie/atualize `config/admins` no banco `greenwindow`, com o campo `uids` (array) contendo esse UID. O app usa essa lista para habilitar a configuração das seis plantas e seus QR Codes; as regras também verificam o UID no servidor.

## Green AI na Web

A Green AI e a validação de fotos usam a SDK do Firebase AI Logic no navegador e enviam prompts ao Gemini pela infraestrutura do Firebase. O chat e suas mensagens recentes ficam apenas na memória da tela; o app não grava a conversa no Firestore. O Firebase AI Logic oferece o Gemini Developer API com nível gratuito para começar, sujeito aos limites e preços atuais do provedor. Cloud Functions não é necessário para o caminho principal da IA.

O diretório `Firebase/functions/` contém uma função de busca web opcional e independente. Ela não é necessária para o chat atual e a publicação de Cloud Functions exige o plano Blaze/faturamento habilitado.

Documentação: [Firebase AI Logic para Web](https://firebase.google.com/docs/ai-logic/get-started?platform=web), [App Check](https://firebase.google.com/docs/app-check) e [regras do Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions).

## Endereço da planta e GPS reversível

O login continua por e-mail e senha; o cadastro não pede CPF. O endereço é o local
onde a planta está sendo cultivada, mesmo que seja diferente da residência da
pessoa. Ele é salvo em `end`, `localCultivo` (endereço, cidade e UF), na planta e
nos novos registros. O cadastro usa validação local, sem depender de IA.

O GPS está desativado em `app-features.js`, por `gpsEnabled: false`. Para restaurar
a opção, altere para `true` e recarregue o app. A captura continua opcional e exige
marcar que a pessoa está junto da planta e autoriza usar a localização. Câmera,
QR Codes e fotos continuam disponíveis. Enquanto a chave estiver desativada,
coordenadas antigas não são reutilizadas em novos registros nem enviadas nas
novas sincronizações. Os dados antigos deste aparelho não são apagados.

## Mapa de utilização no administrador

O mapa usa apenas cadastros com endereço de cultivo completo. Sem endereço, não
há ponto; coordenadas de GPS antigas não criam pontos. Para ver todas as pessoas,
o navegador precisa de acesso administrativo no Firebase e os participantes
precisam ter autorizado a sincronização. Sem esse acesso, aparecem apenas as
contas deste aparelho.

Os marcadores são vermelhos e mostram uma posição **aproximada por município**,
sem indicar a casa ou a rua. Pessoas do mesmo município compartilham um marcador
com contagem; tocar nele mostra seus cadastros. O botão **Atualizar mapa** tenta
novamente quando a conexão falhar ou a cidade não puder ser localizada.

O módulo consulta a lista de municípios e a malha geográfica oficial do IBGE.
Somente UF e código do município são enviados nessas consultas; rua, número,
nome e e-mail não são enviados ao IBGE. O cache local guarda apenas município,
UF e coordenadas aproximadas por até 30 dias. Não exige chave, GPS ou faturamento.
Fontes: [Localidades](https://servicodados.ibge.gov.br/api/docs/localidades) e
[Malhas geográficas](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3).

## Instalação e desbloqueio por QR

A página `instalar.html`, os manifestos PWA e o service worker estão preparados.
Os seis links oficiais estão em [QR-CODES-INSTALACAO.md](QR-CODES-INSTALACAO.md) e
[QR-LINKS-ATUAIS.csv](QR-LINKS-ATUAIS.csv). A publicação `20261028-3` usa `index.html`
como entrada atual, mantendo o arquivo da versão 20 compatível. Os links e os
arquivos carregados incluem a versão para evitar a interface antiga em cache.
O conteúdo de cada imagem QR deve ser o link completo da instalação com seu ID.
O campo `code` do Firestore permanece como identificador interno, sem alteração.

Testes: `node --test Firebase/tests/*.test.cjs`. A instalação depende do navegador;
os botões e instruções não representam uma publicação em loja ou distribuição de APK.
