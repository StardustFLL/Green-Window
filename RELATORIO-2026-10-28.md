# Relatório completo do trabalho — 28/10/2026

Projeto: **Janela Verde / Green Window**  
Repositório: `Green-Window`  
Projeto Firebase: `green-window-71c2c`  
Banco Firestore configurado no app: `greenwindow`

## Resumo executivo

Hoje revisamos a conexão do Web App com o Firebase e implementamos localmente duas frentes principais:

1. **Registro e validação de QR Codes de vasos.** O painel administrativo agora gera um token aleatório por QR, registra esse código no Firestore, associa-o a um `vaseId` e permite imprimir ou desativar o código. O app consulta o banco ao escanear; códigos ausentes ou desativados são recusados. Leituras e novos registros ficam relacionados ao vaso identificado.
2. **Green AI na Web.** O adaptador do Firebase agora chama Firebase AI Logic no navegador, com o Gemini Developer API e o modelo `gemini-3.8-flash` como opção principal. Isso não depende de o app estar aberto no Claude Code. Se a chamada do Firebase falhar, o código mantém os provedores alternativos que o site já tinha.

O código e as regras atualizadas estão no workspace, mas **não foram publicados no Firebase durante esta etapa**. O AI Logic também ainda precisa ser ativado/configurado no Console e a chave do App Check ainda está como placeholder. A publicação não foi feita porque o Firebase CLI indicou que a conta conectada é Stardust, que você proibiu usar; não troquei nem tentei remover essa conta. A automação do Chrome encerrou a sessão porque não conseguiu confirmar a URL ativa do navegador com segurança.

## Linha do tempo e decisões

- Você forneceu a configuração Web Firebase do projeto `green-window-71c2c` e pediu para ligar o site Green Window ao Firestore e criar a base.
- Você autorizou habilitar autenticação anônima e publicar regras. A autenticação anônima é usada pelo site para obter um UID Firebase, mesmo quando a conta local do app é outra.
- Você autorizou o uso do Chrome para concluir a configuração do Firebase, primeiro limitando a navegação ao site Firebase e depois permitindo outros sites somente se fossem necessários para essa configuração.
- Você informou que já havia autenticado o Google Cloud e, mais tarde, que resolveu o problema de MFA.
- Você estabeleceu uma restrição explícita para **não usar, remover ou tentar trocar a conta Stardust**. Essa restrição foi seguida.
- Você recusou habilitar faturamento. Por isso, a solução principal da Green AI não usa Cloud Functions: ela foi montada com Firebase AI Logic e Gemini Developer API. Uma função antiga de busca web continua no diretório `Firebase/functions/`, mas não é necessária para o caminho principal.
- Ao ser perguntado sobre apagar e recriar `greenwindow`, você escolheu manter o banco existente. O código neste trabalho continua apontando para o banco nomeado `greenwindow`, e esta etapa não executou apagamento ou recriação.
- Depois da configuração da base, você pediu uma explicação do app e, em seguida, solicitou que o app passasse a registrar QR Codes oficiais e tivesse uma Green AI permanente na Web. Este relatório cobre o que foi feito para essa solicitação e o estado dos passos anteriores que afetam a publicação.

## Estado conhecido do Firebase antes destas alterações

O código e a configuração existentes apontavam para:

- Projeto Firebase: `green-window-71c2c`.
- App Web: `1:778188797962:web:d7b83d851211d9c9cb47f3`.
- Banco Firestore nomeado: `greenwindow` (não o banco `(default)`).
- Região da Cloud Function opcional: `southamerica-east1`.
- Documento `config/projeto`: valores observados anteriormente incluíam 10 pontos por registro diário, 5 pontos por planta nova, prefixo `janelaverde:` e lista vazia de recompensas.
- Documento `config/admins`: o array `uids` estava vazio na última leitura disponível. Sem um UID nesse array, ninguém consegue usar as funções administrativas do Firestore para criar/desativar QR Codes.
- Havia uma versão de regras do Firestore para cadastros, registros, ranking, configuração e logs. **As regras revisadas nesta implementação, que incluem o registro e a validação de QR Codes, ainda precisam ser publicadas.**

Os valores de configuração Web (apiKey, appId, projectId etc.) são usados pelo app no navegador. A chave do App Check não foi preenchida: o valor atual continua `PREENCHA_COM_A_SITE_KEY_RECAPTCHA`. Não copiamos o valor completo da API key para este relatório; ele permanece em `Firebase/firebase-config.js`.

## QR Codes: comportamento implementado

### Geração e armazenamento

- O painel administrativo do app ganhou a seção **QR Codes dos vasos**.
- O administrador informa um nome/identificação para o vaso e o app gera um token usando `crypto.getRandomValues`.
- Cada token tem 48 caracteres hexadecimais, derivados de 24 bytes aleatórios (192 bits).
- Um ID diferente, no formato `vase_` seguido de 24 caracteres hexadecimais, identifica o vaso.
- O documento é salvo em `qrcodes/{token}` antes de o QR visual ser mostrado para impressão. Se não houver gravação no Firestore, o app não informa que o QR foi criado.
- O documento contém `token`, `codePrefix`, `code`, `vaseId`, `vaseName`, `active`, `scanCount`, `createdAt` e `createdBy`. Depois, podem ser adicionados `lastScannedAt` e `revokedAt`.
- O valor codificado no QR é o prefixo configurado mais o token, por exemplo `janelaverde:<token>`.
- A tela de administração lista os 100 códigos mais recentes, permite imprimir os ativos e desativar um código. Os documentos mais antigos continuam no banco; o limite de 100 é apenas para essa lista da tela.

### Leitura e vínculo ao vaso

- Câmera, foto de QR e entrada manual consultam o documento exato no Firestore. Não basta ter o prefixo correto: token, texto do código, prefixo e estado ativo precisam corresponder ao documento.
- Um QR inexistente ou desativado é recusado. Se o serviço Firebase não estiver disponível, o app não aprova a leitura como válida.
- Uma leitura confirmada atualiza `scanCount` em uma transação e grava `lastScannedAt`.
- Cada leitura também é guardada no histórico local do usuário com `code`, `token`, `vaseId`, `vaseName` e `scannedAt`. `syncUser()` inclui esse histórico no cadastro quando roda; a leitura em si não dispara imediatamente a sincronização do perfil.
- Para registrar uma atividade, o app valida o QR novamente imediatamente antes de salvar. Isso evita usar um código desativado depois da leitura inicial.
- Cada novo documento em `cadastros/{firebaseUid}/regs/{regId}` passa a incluir `qrCode`, `qrToken`, `vaseId` e `vaseName`. Assim, a atividade fica ligada ao mesmo vaso do QR validado.
- Registros locais antigos sem `qrToken`/`vaseId` não são enviados como registros verificados para o Firestore; a regra evita que códigos antigos ou inventados apareçam como atividades validadas.

### Limite físico do QR

O app consegue provar que o valor lido corresponde a um código registrado e ainda ativo no banco. Ele não consegue provar que a etiqueta física é a original: uma cópia idêntica de um QR ativo representa o mesmo vaso e continuará sendo aceita até o administrador desativar esse código.

## IDs e documentos importantes no banco

| Caminho/campo | O que identifica |
|---|---|
| `cadastros/{firebaseUid}` | Espaço de dados associado ao UID anônimo do Firebase deste navegador/instalação. Não é a senha nem o ID da conta local do app. |
| `cadastros/{firebaseUid}.contas.{idLocal}` | Perfil da conta criada no próprio Janela Verde. O app local tem suas contas e senhas no `localStorage`; o identificador local é distinto do UID Firebase. |
| `cadastros/{firebaseUid}/regs/{regId}` | Registro de uma atividade/foto. O ID local gerado no app tem formato `r` + timestamp; os campos `qrToken` e `vaseId` ligam o registro ao QR e vaso. |
| `qrcodes/{token}` | Registro oficial de um QR Code. O `token` também é o ID do documento; o campo `code` é o texto que o QR codifica. |
| `vaseId` | ID aleatório estável do vaso, separado do token do QR. Vários registros daquele vaso apontam para o mesmo ID. |
| `createdBy` | UID Firebase do administrador que criou o QR. |
| `ranking/{firebaseUid}_{idLocal}` | Entrada de ranking criada pelo app para uma conta local associada a um UID Firebase. Contém personagem/avatar e pontuação, não senha. |
| `config/projeto` | Configurações gerais, como prefixo de QR, pontos, regras de validação e recompensas. |
| `config/admins` | Lista de UIDs Firebase autorizados no campo `uids`. Esse documento deve ser alterado por uma pessoa administradora no Console; o cliente não pode conceder permissão a si mesmo. |
| `logs/{logId}` | Logs de análise de fotos, com o proprietário e o resultado da análise. Só são gravados quando a sincronização do usuário está autorizada. |
| `rate_limits/{uid}` | Estrutura prevista para limites da função opcional. As regras do cliente negam acesso direto. |

As leituras de QR são agregadas no próprio documento do QR (`scanCount` e `lastScannedAt`). Não foi criada uma coleção de auditoria individual de cada leitura no Firestore. O histórico local guarda cada leitura no objeto do usuário; o documento de registro guarda o vínculo quando há uma atividade.

## Regras de segurança do Firestore preparadas

O arquivo `Firebase/firestore.rules` agora:

- Exige usuário autenticado para as operações do app; no uso normal, a autenticação é anônima do Firebase.
- Permite ao usuário acessar seu próprio cadastro e subcoleção de registros, e deixa listagens administrativas para o UID configurado em `config/admins.uids`.
- Permite consulta (`get`) de um QR para validar um código; só administrador pode listar todo o inventário.
- Só permite criar um QR como administrador e exige o formato/token, prefixo, associação ao vaso, estado inicial e timestamp do servidor esperados.
- Permite atualizar QR como administrador ou incrementar `scanCount` exatamente em 1, preservando token, código e identidade do vaso. A leitura só pode atualizar QR ativo.
- Só permite que o registro do usuário seja criado se o QR existir e estiver ativo e se `qrCode`, `qrToken`, `vaseId` e `vaseName` forem iguais ao documento do QR.
- Mantém a negação final para caminhos que não estão explicitamente liberados.

As regras são uma parte essencial do bloqueio: a validação no JavaScript melhora a experiência, mas a regra no servidor impede que o navegador grave uma atividade com um QR inventado ou associado a outro vaso.

## Green AI: funcionamento implementado

- `Firebase/firebase-adapter.js` carrega dinamicamente a biblioteca `firebase-ai.js` da SDK Web Firebase 13.1.0.
- O adapter inicializa Firebase AI Logic com `GoogleAIBackend` e usa o modelo configurado `gemini-3.8-flash`.
- Perguntas de texto, histórico recente da conversa e imagens de análise são enviados pela SDK à infraestrutura Firebase/Gemini. Imagens JPEG, PNG e WebP são preparadas como dados inline.
- O app não grava o histórico da Green AI no Firestore. O histórico recente existe em memória da tela durante o uso. A política de privacidade do app informa que perguntas e imagens são enviadas ao provedor e recomenda não inserir CPF, endereço ou outros dados pessoais.
- `openSample()` agora tenta o serviço do Firebase primeiro. Se a chamada de Firebase AI Logic não estiver configurada ou falhar, o app conserva os provedores alternativos já existentes (Pollinations/OVH). Portanto, a Green AI não depende do Claude Code, mas ainda tem uma rota alternativa externa.
- O adapter preserva o runtime nativo do Claude quando o site é aberto dentro dele; no navegador comum, oferece os serviços Firebase para o app.
- A pasta `Firebase/functions/` ainda tem uma callable `answerWithWeb` com busca Google, limite de taxa e App Check, mas o chat atual não depende dela. Cloud Functions exige configuração de faturamento/plano compatível; como você recusou habilitar faturamento, não escolhemos esse caminho para a Green AI principal.
- A função opcional atualmente chama `getFirestore()` sem selecionar o banco nomeado. Como o app usa `greenwindow`, essa função precisa ser revisada para apontar explicitamente para esse banco antes de ser usada; ela não foi implantada nem é chamada pelo chat atual.

O Firebase recomenda a configuração do AI Logic no Console e App Check para proteger chamadas feitas diretamente da Web. A documentação do Firebase mostra o modelo `gemini-3.8-flash` e a opção Gemini Developer API como início sem custo, sujeito às quotas e condições vigentes: [AI Logic para Web](https://firebase.google.com/docs/ai-logic/get-started?platform=web), [visão geral do AI Logic](https://firebase.google.com/docs/ai-logic), [entrada de imagens](https://firebase.google.com/docs/ai-logic/analyze-images).

## Arquivos do projeto relacionados

- `index.html`: telas, câmera/foto/manual de QR, vínculo de QR com registro, painel de QR Codes, Green AI e textos de privacidade. Inclui as bibliotecas visuais jsQR e qrcodejs via CDN.
- `Firebase/firebase-adapter.js`: inicialização do Firebase, Auth anônima, Firestore no banco `greenwindow`, APIs de QR e chamada Firebase AI Logic.
- `Firebase/firestore.rules`: regras que validam QR e vínculo do vaso.
- `Firebase/firebase-config.js`: parâmetros públicos do app Web, ID do banco, modelo Gemini e placeholder do App Check.
- `firebase.json`: aponta a implantação das regras para o banco `greenwindow` e mantém o código de Functions configurado.
- `Firebase/functions/index.js`: função opcional de busca web, separada do caminho principal.
- `README.md`: documentação de estrutura, consentimento, sincronização, QR e configuração da IA.
- `Firebase/package.json`, `Firebase/package-lock.json` e `Firebase/functions/package.json`: manifests que já estão no workspace para o material Firebase.

## O que falta fazer no Console para entrar em produção

1. Usar uma sessão autorizada do projeto que **não seja Stardust**. O CLI estava conectado apenas como Stardust na leitura disponível; por sua instrução, não fiz deploy, logout nem troca de conta.
2. No Firebase Console do projeto `green-window-71c2c`, abrir **AI Services → AI Logic**, concluir a configuração com **Gemini Developer API** para o app Web e confirmar o App Check exigido pelo fluxo. O AI Logic ainda não foi ativado nesta etapa.
3. Registrar o domínio real do site no Firebase App Check (reCAPTCHA v3) e preencher `appCheckSiteKey` em `Firebase/firebase-config.js`. A chave atual ainda é placeholder. Confirmar também o domínio autorizado para autenticação anônima.
4. Publicar as novas regras no banco já existente `greenwindow`, pela raiz do repositório, com a conta permitida: `firebase deploy --only firestore:rules`. Esse comando não foi executado nesta etapa.
5. Abrir a área administrativa do app, copiar o UID Firebase anônimo do navegador e incluí-lo manualmente no array `uids` de `config/admins`. Na última leitura disponível esse array estava vazio. Sem isso, o painel administrativo não consegue gerar nem desativar QR Codes.
6. Depois desses passos, entrar no painel, gerar um QR para cada vaso e imprimir as etiquetas. Os documentos serão criados pelo app no momento da geração.

O AI Logic do Gemini Developer API foi escolhido para evitar depender de publicar uma Cloud Function e habilitar faturamento. Isso não significa que a configuração do Console já esteja concluída, nem que qualquer uso futuro esteja livre de limites ou mudanças de quota.

## Estado local e checagens realizadas

- As mudanças estão somente no workspace; não houve commit nesta etapa.
- Ao final, `git status --short` mostrava `README.md` e `index.html` modificados e `Firebase/`, `firebase.json`, `init.txt`, `script.js` e `style.css` como não rastreados. Alguns desses arquivos já estavam no estado de trabalho antes da última revisão; não se deve presumir que todos foram criados hoje.
- `git diff --check` terminou sem reportar problemas de whitespace.
- Não foram executados testes automatizados.
- Não foram publicadas regras, habilitados serviços ou alterados documentos do Firebase nesta última etapa.
- A tentativa de automação do Chrome foi interrompida pela ferramenta porque ela não pôde confirmar a URL ativa do navegador com confiança. Não houve troca ou remoção de conta.


