# 🌿 Janela Verde

App web de jardinagem e biodiversidade da equipe **STARDUST – SESI 005 Limeira**: cadastro com GPS, leitura de QR Code do vaso, registro diário de plantas com foto (validada por IA), pontos, ranking, avatar, recompensas, assistente **Green AI** e painel do administrador.

É um projeto de **um único arquivo** (`index.html`, sem build, sem npm).

## Arquivos do repositório

| Arquivo | Para quê | Enviar ao GitHub? |
|---|---|---|
| `index.html` | O app inteiro (HTML + CSS + JS) | ✅ Sim |
| `README.md` | Este guia | ✅ Sim |
| `.gitignore` | Evita enviar segredos e lixo | ✅ Sim |
| `node_modules/`, `.env`, `serviceAccount*.json`, `*.log`, `*.tmp`, `.DS_Store`, `*.zip` | Dependências, credenciais, temporários | ❌ **Nunca** (já estão no `.gitignore`) |

> O projeto não usa npm, então não existe `node_modules`, `package.json` nem `.env`. As regras ficam no `.gitignore` por segurança, caso um dia você adicione essas coisas.

## Publicar (GitHub Pages)

1. No repositório: **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
2. O app fica em `https://SEU-USUARIO.github.io/SEU-REPO/`.

Hospedado assim (fora do claude.ai), a Green AI e a validação de fotos usam **IA aberta, sem conta** (Pollinations / OVHcloud), com troca automática de provedor. Esses serviços têm limites de uso; veja "IA" abaixo.

## Como os dados funcionam hoje

- **Fora do claude.ai:** cadastros, plantas, registros, fotos e pontos ficam só no aparelho (`localStorage`, chave `jv_demo_v1`). Ranking e painel do administrador **não** são compartilhados entre pessoas.
- **Dentro do claude.ai:** o app usa o banco do próprio Claude (`claude.use("db")`).

O código inteiro do banco passa por **4 chamadas**: `claude.use("db")`, `claude.use("user")`, `claude.use("downloads")` e `dbh()`. Por isso dá para ligar o Cloud Firestore **sem mexer no resto do app**, só adicionando um bloco de código (passo 5).

## Integrar com o Cloud Firestore

### 1. Criar o projeto
1. Acesse <https://console.firebase.google.com> → **Adicionar projeto**.
2. **Build → Firestore Database → Criar banco de dados** (modo produção; escolha uma região, por exemplo `southamerica-east1`, São Paulo).

### 2. Ligar a autenticação anônima (as pessoas não precisam de conta)
**Build → Authentication → Sign-in method → Anônimo → Ativar.**
Em **Settings → Authorized domains**, adicione `SEU-USUARIO.github.io`.

### 3. Pegar a configuração web
**Configurações do projeto (engrenagem) → Seus apps → `</>` Web → Registrar app** e copie o objeto `firebaseConfig`. Essa configuração **não é segredo**: quem protege os dados são as regras do passo 4.

### 4. Regras de segurança (obrigatório)
**Firestore → Regras**, cole e publique:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function logado() { return request.auth != null; }
    function admin() {
      return logado() &&
        request.auth.uid in get(/databases/$(database)/documents/config/admins).data.uids;
    }

    // cadastros/{uid} e cadastros/{uid}/regs/{id}: só o dono e o administrador
    match /cadastros/{uid} {
      allow read, write: if logado() && (request.auth.uid == uid || admin());
      match /regs/{rid} {
        allow read, write: if logado() && (request.auth.uid == uid || admin());
      }
    }

    // ranking: todos leem; cada um grava só o próprio (id = uid_idDaConta)
    match /ranking/{docId} {
      allow read: if logado();
      allow write: if logado() && (docId.matches(request.auth.uid + '_.*') || admin());
    }

    // configurações do projeto: todos leem, só admin altera
    match /config/{docId} {
      allow read: if logado();
      allow write: if admin();
    }

    // logs de fotos: qualquer um cria, só admin lê
    match /logs/{docId} {
      allow create: if logado();
      allow read, delete: if admin();
    }
  }
}
```

### 5. Adicionar o adaptador no `index.html`
Cole este bloco **logo antes do `<script>` principal** (o que começa com `const AI_KEY=""`, depois da linha do `jsQR`). Troque só o `FIREBASE_CONFIG`.
Dentro do claude.ai ele não faz nada (usa o banco nativo); fora dele, liga o Firestore.

```html
<script>
/* Firestore para o Janela Verde — não altera o resto do app */
(function(){
  if (typeof window.claude !== "undefined") return;
  const FIREBASE_CONFIG = {
    apiKey: "COLE_AQUI", authDomain: "SEU-PROJETO.firebaseapp.com",
    projectId: "SEU-PROJETO", appId: "COLE_AQUI"
  };
  const B = "https://www.gstatic.com/firebasejs/10.12.2/";
  let boot;
  function init(){ return boot || (boot = (async () => {
    const [A, AU, F] = await Promise.all([
      import(B + "firebase-app.js"), import(B + "firebase-auth.js"), import(B + "firebase-firestore.js")
    ]);
    const app = A.initializeApp(FIREBASE_CONFIG), auth = AU.getAuth(app);
    const fs = F.initializeFirestore(app, { ignoreUndefinedProperties: true });
    const user = await new Promise(res => {
      const off = AU.onAuthStateChanged(auth, u => { if (u) { off(); res(u); } });
      AU.signInAnonymously(auth).catch(() => res(null));
    });
    if (!user) throw new Error("auth");
    let admin = false;
    try { const s = await F.getDoc(F.doc(fs, "config/admins")); admin = s.exists() && (s.data().uids || []).includes(user.uid); } catch (e) {}
    const snap = s => ({ id: s.id, exists: s.exists(), data: () => s.data() });
    const db = {
      doc: p => ({
        get: async () => snap(await F.getDoc(F.doc(fs, p))),
        set: async d => F.setDoc(F.doc(fs, p), d),
        delete: async () => F.deleteDoc(F.doc(fs, p))
      }),
      collection: p => {
        const mk = (ob, lm) => ({
          orderBy: (f, d) => mk([f, d || "asc"], lm),
          limit: n => mk(ob, n),
          get: async () => {
            const c = []; if (ob) c.push(F.orderBy(ob[0], ob[1])); if (lm) c.push(F.limit(lm));
            const q = await F.getDocs(F.query(F.collection(fs, p), ...c));
            return { docs: q.docs.map(d => ({ id: d.id, data: () => d.data() })) };
          }
        });
        return mk(null, null);
      }
    };
    return { db, us: { id: async () => user.uid, canEdit: () => admin } };
  })()); }
  window.claude = { use: async name => {
    if (name === "db") return (await init()).db;
    if (name === "user") return (await init()).us;
    if (name === "downloads") return { save: async ({ filename, data }) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
      a.download = filename; a.click();
    } };
    return null; // "sample"/"permissions": o app usa a IA aberta
  } };
})();
</script>
```

### 6. Tornar-se administrador
1. Abra o app hospedado uma vez, no navegador que você vai usar como admin.
2. Firebase → **Authentication → Users** → copie o **UID** do usuário anônimo (o mais recente).
3. Firestore → **Iniciar coleção** `config` → documento `admins` → campo `uids` (tipo *array*) com esse UID.
4. Recarregue o app. O painel do administrador passa a listar todas as contas.

> O UID anônimo vale para aquele navegador. Se limpar os dados do navegador, o UID muda e é preciso repetir o passo.

### 7. Onde cada dado vai parar

| Dado | Caminho no Firestore |
|---|---|
| Contas (nome, CPF, e-mail, telefone, nascimento, GPS, pontos, nº de registros) | `cadastros/{uid}` → campo `contas` |
| Registros de fotos (data, observação, planta, GPS, QR, **miniatura** `th`) | `cadastros/{uid}/regs/{idRegistro}` |
| Ranking (personagem, avatar, pontos, dias) | `ranking/{uid}_{idConta}` |
| Configurações e recompensas | `config/projeto` |
| Histórico de aprovação/recusa de fotos | `logs/{timestamp}_{uid}` |
| Administradores | `config/admins` → `uids` |

### 8. Fotos: o que vai para o Firestore
Hoje o app envia ao Firestore só a **miniatura** (360 px, em `th`). A foto de 600 px continua no aparelho.
Para enviar também a foto de 600 px (cerca de 40–100 KB), na função `syncReg` do `index.html` troque `th:tmp.th||""` por `th:tmp.th||"",foto:r.foto||""`.

- O Firestore limita cada documento a **1 MiB**. As fotos já são reduzidas, então cabem.
- Para fotos grandes ou originais, use o **Cloud Storage** e guarde só o link no Firestore. Hoje o Storage costuma exigir o plano Blaze; confira no console antes.

## Segurança e LGPD

- **Não envie ao GitHub:** chaves privadas, contas de serviço, `.env` e a `AI_KEY` preenchida. A config web do Firebase pode ir.
- O Firestore passará a guardar **CPF, telefone, nascimento e localização** de pessoas, inclusive menores. Mantenha as regras do passo 4 e **atualize o texto de privacidade** (hoje diz "Dados salvos neste aparelho").
- Revise as cotas gratuitas do Firebase (leituras/gravações por dia) antes de usar com a turma toda.

## IA

- Dentro do claude.ai: usa a IA do Claude.
- Fora dele: tenta IA aberta, sem conta (OVHcloud e Pollinations), com troca automática; o cadastro e as fotos **não travam** se a IA estiver fora do ar.
- Os limites do uso sem conta são baixos. Para uso em turma, gere uma chave gratuita e coloque em `AI_KEY` **somente na sua cópia local**, nunca no repositório público.
- Teste: abra o console do navegador (F12) e rode `testarIA()`.

## Limitações conhecidas

- O adaptador do Firestore e os nomes de modelos de IA não foram testados em produção; teste com 2 aparelhos antes de usar com os alunos.
- A senha das contas é guardada com hash (PBKDF2) no aparelho; o Firestore não substitui o login do app, só sincroniza os dados.
