# Integração Firestore verificada — 28/10/2026

## Concluído no projeto real

- Projeto `green-window-71c2c`, banco nomeado `greenwindow`.
- Documentos `plantas/planta-1` até `plantas/planta-6` criados com nome numerado,
  código `janelaverde:planta-N`, estado ativo e contador inteiro inicial zero.
- Regras atualizadas publicadas pelo Google Cloud Console; o Console confirmou
  o novo conjunto como ativo às 11:40:49 no horário exibido pela sessão.
- Autenticação anônima do próprio Web SDK confirmada no Chrome.
- Leitura dos seis documentos pelo adapter real do app: sucesso, 6/6.
- Transação de leitura do QR da Planta 1: sucesso, com incremento real do contador.
  Essa planta ficou com uma leitura técnica; o teste não zerou contadores depois.
- Registro de atividade técnico criado, lido de volta e removido no espaço do
  usuário anônimo do navegador, sem dados pessoais.
- Tentativa de registro com QR incorreto: recusada pelo servidor com
  `permission-denied`, usando usuário sem privilégio administrativo.
- Conta Google já aberta no Console mantida. Não houve troca/remoção de conta,
  exclusão de dados existentes ou habilitação de faturamento.

## Arquivos e acesso

`Janela Verde (20).html` e `index.html` usam os arquivos compartilhados
`Firebase/firebase-config.js` e `Firebase/firebase-adapter.js`.
O botão **Verificar conexão com o banco**, em **Perfil → Privacidade**, abre
`Firebase/conexao.html` para repetir a verificação real.

O teste foi feito servindo o repositório em `http://127.0.0.1:8766`.
O servidor foi mantido aberto para uso local. A configuração não publicou os
arquivos Web no GitHub Pages nem em outro serviço de hospedagem.

Comprovante: `Firebase/evidencias/conexao-firestore-2026-10-28.jpg`.

## Configurações separadas

- `config/admins.uids` permanece sem novos administradores: a integração normal
  não exige conceder acesso administrativo ao navegador de teste. O painel de
  gestão exige um UID escolhido e autorizado para essa finalidade.
- A ativação do Firebase AI Logic e o App Check da IA continuam separados desta
  conexão Firestore. A chave de site App Check ainda é placeholder no arquivo
  de configuração. Os testes acima não afirmam que a IA esteja ativada no projeto.
- O login do Firebase CLI não foi usado para publicar: a consulta por ele não
  tinha permissão no projeto. O Console já autenticado permitiu concluir a tarefa.

## Verificação local

Os testes de seis plantas e de integração da versão 20 foram mantidos e passaram.
Os testes no navegador descritos acima usaram o serviço real, sem SDK simulado.
