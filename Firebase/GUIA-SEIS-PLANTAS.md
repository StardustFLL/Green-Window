# Seis plantas, seis QR Codes fixos

O banco usado pelo app é `greenwindow`, no projeto `green-window-71c2c`.
Cada planta tem um documento fixo na coleção `plantas`. Novas leituras atualizam
o contador desse documento; novas fotos criam atividades relacionadas ao mesmo
`projectPlantId`. Nenhuma dessas ações cria um QR novo.

**Estado verificado em 28/10/2026:** as seis plantas abaixo foram cadastradas
no banco real e as novas regras foram publicadas e ativadas. A autenticação
anônima, a consulta das seis plantas, a atualização do contador de QR e a
gravação/leitura de um registro temporário foram testadas no Chrome com o mesmo
adapter usado pelo app. O servidor recusou o registro com QR incorreto.
O registro técnico foi removido após o teste; nenhum cadastro pessoal foi criado.

| Documento | Nome inicial (`plantName`) | Identificador interno (`code`) |
|---|---|---|
| `plantas/planta-1` | Planta 1 | `janelaverde:planta-1` |
| `plantas/planta-2` | Planta 2 | `janelaverde:planta-2` |
| `plantas/planta-3` | Planta 3 | `janelaverde:planta-3` |
| `plantas/planta-4` | Planta 4 | `janelaverde:planta-4` |
| `plantas/planta-5` | Planta 5 | `janelaverde:planta-5` |
| `plantas/planta-6` | Planta 6 | `janelaverde:planta-6` |

## Opção 1: cadastrar pelo app

1. Publique o código atualizado do site e as regras de `Firebase/firestore.rules`
   no banco `greenwindow`. A mudança local não publica esses arquivos automaticamente.
2. O UID Firebase anônimo do navegador do administrador precisa estar no array
   `uids` de `config/admins`. O painel tem um botão para copiar esse UID.
3. No painel administrativo, abra **As seis plantas do projeto**.
4. Deixe os nomes numerados e clique em **Cadastrar planta e QR** em cada uma
   das seis posições. O app cria os documentos, inicialmente ativos.
5. Use **Imprimir QR** para obter as etiquetas. Reimprimir não grava um novo QR.

Salvar novamente altera o nome e reativa a planta, preservando o documento,
o texto do QR e o contador. O código não depende do prefixo antigo em `config/projeto`.

## Opção 2: cadastrar diretamente no Firestore Console

1. Abra Firestore Database, selecione o banco **greenwindow** e crie a coleção
   **plantas** (se ainda não existir).
2. Crie o documento com ID exato **planta-1**. Não use ID automático.
3. Insira os campos abaixo, respeitando os tipos:

| Campo | Tipo no Console | Valor |
|---|---|---|
| `plantId` | string | `planta-1` |
| `plantName` | string | `Planta 1` |
| `code` | string | `janelaverde:planta-1` |
| `active` | boolean | `true` |
| `scanCount` | number (inteiro) | `0` |

4. Repita para `planta-2` até `planta-6`, conforme a tabela inicial.
5. Na nova estratégia, crie as imagens QR usando os links HTTPS de instalação
   descritos em [QR-CODES-INSTALACAO.md](../QR-CODES-INSTALACAO.md), ou use
   **Imprimir QR de instalação** no painel após publicar o site. Os valores de
   `code` da tabela continuam no banco como identificadores internos.

Os cinco campos são suficientes para um cadastro manual. Quando o app cadastra,
ele também inclui `createdAt` (timestamp do servidor) e `createdBy` (UID do administrador).
As leituras acrescentam/atualizam `lastScannedAt` (timestamp) e incrementam `scanCount`.
O Console tem privilégios administrativos; mantenha os IDs e códigos da tabela,
mesmo que ele permita gravar valores diferentes das regras do cliente.

## Como relacionar o QR à espécie quando os nomes forem definidos

Se a Planta 1 for, por exemplo, manjericão, altere apenas
`plantas/planta-1.plantName` para `Manjericão`. O identificador interno continua
`janelaverde:planta-1`, e o link de instalação continua levando `?planta=planta-1`.
A etiqueta mantém seu vínculo com a mesma posição. Faça o mesmo com
as outras cinco posições. Não altere `plantId` nem `code`, nem crie outro documento.

Cada nova atividade registra `projectPlantId`, `plantName` (nome no momento da
atividade) e `qrCode`. O ID faz a relação; o nome pode ser atualizado depois.
Registros antigos mantêm o nome registrado na época. Se dois nomes forem iguais,
os IDs ainda distinguem as plantas.

## O que muda em relação à estratégia anterior

- O app deixou de gerar tokens aleatórios e novos documentos em `qrcodes`.
- Existem no máximo seis posições aceitas pelo cliente e pelas regras.
- Um QR identifica a planta do catálogo, compartilhada entre participantes;
  ele não identifica um vaso individual ou um exemplar diferente da mesma planta.
- Na versão 20, todas as seis plantas começam bloqueadas. Ler o QR oficial
  desbloqueia e seleciona somente a planta correspondente. Fotos e metas não fazem
  o desbloqueio de outras plantas. O link recebido antes do login é preservado.
- Ler o QR seleciona a planta automaticamente. O participante não pode trocar
  o nome no formulário de atividade ou adicionar uma sétima planta pela interface.
- O histórico local mantém uma entrada por planta com contador e última leitura,
  em vez de acrescentar outra entrada de QR a cada leitura.
- Novas atividades continuam sendo documentos distintos: são as fotos/registros
  diários, não novos códigos QR.
- Documentos e atividades antigos foram preservados. A nova leitura deixa de
  aceitar os tokens antigos de `qrcodes`; use as seis etiquetas fixas.
- Código não cadastrado, posição fora de 1 a 6 ou planta com `active: false` é recusado.
- Cópias da mesma etiqueta são o mesmo código: o sistema valida o cadastro,
  sem distinguir a etiqueta física original de uma cópia.

Os campos legados `qrToken`, `vaseId` e `vaseName` ainda acompanham as atividades
para compatibilidade; nas novas atividades, os dois primeiros recebem o ID fixo
da planta. A associação principal é `projectPlantId`.

## Publicação e verificação

### Arquivo Janela Verde (20).html

Essa versão mantém o catálogo, coleção, fotos de metas e agenda. A estratégia
de desbloqueio foi atualizada: as seis plantas, incluindo a Jabuticaba, exigem
seu próprio QR; a antiga exigência de completar cinco plantas foi removida. Ela usa os mesmos arquivos
`Firebase/firebase-config.js` e `Firebase/firebase-adapter.js` do `index.html`;
ao publicar o HTML, mantenha a pasta `Firebase` ao lado dele.

A correspondência entre os seis IDs numerados e o catálogo dessa versão é:

| ID Firestore | ID interno do catálogo | Planta no catálogo |
|---|---|---|
| `planta-1` | `onze` | Onze-horas |
| `planta-2` | `lambari` | Lambari-roxo |
| `planta-3` | `tradescantia` | Tradescantia |
| `planta-4` | `trapoeraba` | Trapoeraba |
| `planta-5` | `capim` | Capim-limão |
| `planta-6` | `jabuticaba` | Jabuticaba |

Os nomes no banco podem continuar numerados. O acompanhamento de crescimento
relaciona as fotos pelo ID, sem exigir que o nome `Planta 1` seja igual a
`Onze-horas`. Os nomes de espécies e as informações do catálogo foram preservados;
alterar `plantName` no banco muda o rótulo do registro, não a espécie do catálogo.
Para trocar a espécie de uma posição, ajuste também o catálogo no HTML.

Com consentimento, os dados da coleção, metas e agenda são incluídos no cadastro
sincronizado. As fotos da coleção e das metas continuam locais; o envio dessas
imagens à IA é usado para análise. Os registros diários mantêm a sincronização
de miniaturas já implementada. O texto da tela de privacidade explica essa diferença.

Para verificar as duas versões localmente:

```powershell
node --test Firebase/tests/fixed-plants.test.cjs Firebase/tests/jv20-integration.test.cjs
$env:JV_HTML_FILE = 'Janela Verde (20).html'
node --test Firebase/tests/fixed-plants.test.cjs
```

### Aplicar ao projeto Firebase

Na raiz do repositório, com uma conta Firebase permitida:

```sh
firebase deploy --only firestore:rules --project green-window-71c2c
```

O `firebase.json` já aponta para `greenwindow`. Esse comando não cadastra as seis
plantas nem publica o site; use uma das opções acima para os documentos e o fluxo
habitual do site para o código Web. A CLI exige uma conta com permissão no projeto;
a configuração verificada acima foi concluída pelo Console já autenticado, sem
trocar/remover contas nem habilitar faturamento.

### Diagnóstico no próprio navegador

Abra `Firebase/conexao.html` pelo mesmo servidor/domínio do app. A página usa
`firebase-config.js` e `firebase-adapter.js`, sem credencial administrativa.
Ela permite consultar as seis plantas, simular uma leitura real do QR da Planta 1
e testar uma atividade temporária, inclusive a recusa de QR inválido. A leitura
real de QR incrementa seu contador. O teste de registro cria e remove apenas seu
próprio documento técnico.

A tela **Perfil → Privacidade** contém o link **Verificar conexão com o banco**.
Para abrir a versão local por HTTP, execute na raiz do repositório:

```sh
python -m http.server 8766 --bind 127.0.0.1
```

Depois abra `http://127.0.0.1:8766/Janela%20Verde%20(20).html`.
O servidor local não publica o site na internet. A ativação do Firebase AI Logic
e sua chave App Check são configurações separadas da conexão Firestore testada.

Testes locais: `node --test Firebase/tests/fixed-plants.test.cjs`.
Eles simulam o SDK sem acessar o projeto real e cobrem as seis posições,
reutilização de código/documento, desativação, códigos desconhecidos, histórico
local sem duplicação e vínculo de atividades por ID. Não substituem uma execução
das regras no emulador ou a verificação do site publicado.
