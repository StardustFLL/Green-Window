/* Adaptador para o app estático Janela Verde. Não substitui o runtime do Claude
   quando o site é aberto dentro dele; fora dele, usa Firebase Auth/Firestore. */
(function () {
  "use strict";

  const config = window.JV_FIREBASE_CONFIG || {};
  const sdkVersion = "13.1.0";
  const sdkBase = `https://www.gstatic.com/firebasejs/${sdkVersion}/`;
  const configured = !!(
    config.apiKey && !config.apiKey.startsWith("PREENCHA_") &&
    config.projectId && config.projectId !== "SEU_PROJETO" &&
    config.appId && !config.appId.startsWith("PREENCHA_")
  );
  window.JV_FIREBASE_CONFIGURED = configured;

  // Dentro do Claude, preserve os serviços nativos que o app já usa.
  if (window.claude && typeof window.claude.use === "function") return;

  let boot;
  function init() {
    if (!configured) throw new Error("Firebase ainda não foi configurado.");
    if (boot) return boot;

    boot = (async () => {
      const [appSdk, authSdk, storeSdk] = await Promise.all([
        import(sdkBase + "firebase-app.js"),
        import(sdkBase + "firebase-auth.js"),
        import(sdkBase + "firebase-firestore.js")
      ]);
      const apps = appSdk.getApps();
      const app = apps.find(x => x.name === "janela-verde") ||
        appSdk.initializeApp(config, "janela-verde");
      if (config.appCheckSiteKey && !config.appCheckSiteKey.startsWith("PREENCHA_") && !window.JV_APP_CHECK_INITIALIZED) {
        const checkSdk = await import(sdkBase + "firebase-app-check.js");
        checkSdk.initializeAppCheck(app, {
          provider: new checkSdk.ReCaptchaV3Provider(config.appCheckSiteKey),
          isTokenAutoRefreshEnabled: true
        });
        window.JV_APP_CHECK_INITIALIZED = true;
      }
      const auth = authSdk.getAuth(app);
      let user = await new Promise(resolve => {
        let stop = () => {};
        let received = false;
        stop = authSdk.onAuthStateChanged(auth, current => {
          if (received) return;
          received = true;
          queueMicrotask(() => stop());
          resolve(current);
        });
      });
      if (!user) user = (await authSdk.signInAnonymously(auth)).user;
      if (!user) throw new Error("Não foi possível autenticar no Firebase.");

      const db = storeSdk.getFirestore(app, config.databaseId || "(default)");
      let admin = false;
      try {
        const admins = await storeSdk.getDoc(storeSdk.doc(db, "config", "admins"));
        admin = admins.exists() && Array.isArray(admins.data().uids) && admins.data().uids.includes(user.uid);
      } catch (_) {}

      const wrapSnap = snap => ({
        id: snap.id,
        exists: snap.exists(),
        data: () => snap.data()
      });
      const firestore = {
        doc(path) {
          const ref = storeSdk.doc(db, path);
          return {
            get: async () => wrapSnap(await storeSdk.getDoc(ref)),
            set: async data => storeSdk.setDoc(ref, data),
            delete: async () => storeSdk.deleteDoc(ref)
          };
        },
        collection(path) {
          const make = (sort, max, filters) => ({
            orderBy: (field, direction) => make([field, direction || "asc"], max, filters),
            limit: count => make(sort, count, filters),
            where: (field, op, value) => make(sort, max, [...filters, [field, op, value]]),
            get: async () => {
              const constraints = filters.map(([field, op, value]) => storeSdk.where(field, op, value));
              if (sort) constraints.push(storeSdk.orderBy(sort[0], sort[1]));
              if (max) constraints.push(storeSdk.limit(max));
              const ref = storeSdk.collection(db, path);
              const result = await storeSdk.getDocs(constraints.length ? storeSdk.query(ref, ...constraints) : ref);
              return { docs: result.docs.map(snap => ({ id: snap.id, data: () => snap.data() })) };
            }
          });
          return make(null, null, []);
        }
      };
      // Seis posições fixas: salvar ou ler nunca cria outro identificador.
      const plantIds = Array.from({ length: 6 }, (_, i) => `planta-${i + 1}`);
      const plantCode = id => `janelaverde:${id}`;
      const plantRow = (id, data = {}) => ({
        ...data, plantId: id, token: id, vaseId: id,
        plantName: data.plantName || `Planta ${id.slice(-1)}`,
        vaseName: data.plantName || `Planta ${id.slice(-1)}`,
        code: plantCode(id), configured: !!data.plantId,
        createdAt: data.createdAt?.toMillis?.() || 0,
        lastScannedAt: data.lastScannedAt?.toMillis?.() || null
      });
      const parsePlant = raw => {
        if (window.JV_QR_LINKS) return window.JV_QR_LINKS.parse(raw);
        const code = String(raw || "").trim();
        const id = code.replace(/^janelaverde:/, "");
        return plantIds.includes(id) && code === plantCode(id) ? id : null;
      };
      const matchesPlant = (id, data) => data.active === true && data.plantId === id
        && data.code === plantCode(id) && typeof data.plantName === "string" && !!data.plantName.trim();
      const qrCodes = {
        async configure(plantId, plantName) {
          if (!admin) throw new Error("Este UID não tem permissão de administrador.");
          if (!plantIds.includes(plantId)) throw new Error("Escolha uma das seis plantas.");
          const name = String(plantName || "").trim();
          if (!name || name.length > 100) throw new Error("Informe um nome de até 100 caracteres.");
          const ref = storeSdk.doc(db, "plantas", plantId);
          await storeSdk.runTransaction(db, async transaction => {
            const snap = await transaction.get(ref);
            if (snap.exists()) {
              transaction.update(ref, { plantName: name, active: true });
            } else {
              transaction.set(ref, { plantId, plantName: name, code: plantCode(plantId), active: true,
                scanCount: 0, createdAt: storeSdk.serverTimestamp(), createdBy: user.uid });
            }
          });
          return plantRow(plantId, (await storeSdk.getDoc(ref)).data());
        },
        async list() {
          if (!admin) throw new Error("Este UID não tem permissão de administrador.");
          return Promise.all(plantIds.map(async id => {
            const snap = await storeSdk.getDoc(storeSdk.doc(db, "plantas", id));
            return plantRow(id, snap.exists() ? snap.data() : {});
          }));
        },
        async revoke(plantId) {
          if (!admin || !plantIds.includes(plantId)) throw new Error("Permissão ou planta inválida.");
          await storeSdk.updateDoc(storeSdk.doc(db, "plantas", plantId), { active: false });
        },
        async lookup(rawCode) {
          const id = parsePlant(rawCode);
          if (!id) return null;
          const snap = await storeSdk.getDoc(storeSdk.doc(db, "plantas", id));
          return snap.exists() && matchesPlant(id, snap.data()) ? plantRow(id, snap.data()) : null;
        },
        async scan(rawCode) {
          const id = parsePlant(rawCode);
          if (!id) return null;
          const ref = storeSdk.doc(db, "plantas", id);
          return storeSdk.runTransaction(db, async transaction => {
            const snap = await transaction.get(ref);
            if (!snap.exists() || !matchesPlant(id, snap.data())) return null;
            const data = snap.data();
            transaction.update(ref, { scanCount: data.scanCount + 1, lastScannedAt: storeSdk.serverTimestamp() });
            return plantRow(id, data);
          });
        }
      };
      let aiSdkPromise;
      let samplePromise;
      const loadAiSdk = () => {
        if (!aiSdkPromise) aiSdkPromise = import(sdkBase + "firebase-ai.js");
        return aiSdkPromise;
      };
      const dataUrlFor = image => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Não foi possível preparar a imagem para a IA."));
        reader.readAsDataURL(image);
      });
      const imagePart = async image => {
        const dataUrl = typeof image === "string" ? image : await dataUrlFor(image);
        const match = /^data:(image\/(?:jpeg|png|webp));base64,([\s\S]+)$/i.exec(dataUrl);
        if (!match) throw new Error("Formato de imagem não aceito pela IA.");
        return { type: "inlineData", inlineData: { mimeType: match[1].toLowerCase(), data: match[2] } };
      };
      const cloudSample = async (prompt, options) => {
        const aiSdk = await loadAiSdk();
        const ai = aiSdk.getAI(app, { backend: new aiSdk.GoogleAIBackend() });
        const model = aiSdk.getGenerativeModel(ai, {
          model: config.greenAiModel || "gemini-3.8-flash",
          generationConfig: { maxOutputTokens: 900, temperature: 0.3 }
        });
        const text = Array.isArray(prompt)
          ? prompt.map(item => `${item.role === "assistant" ? "Green AI" : "Usuário"}: ${String(item.content || "")}`).join("\n")
          : String(prompt || "");
        const images = Array.isArray(options?.images) ? options.images.slice(0, 3) : [];
        const parts = await Promise.all(images.map(imagePart));
        const result = await model.generateContent(parts.length ? [text, ...parts] : text);
        const answer = result.response.text();
        if (!answer) throw new Error("A IA não retornou uma resposta.");
        return { text: answer };
      };
      const sample = async (prompt, options) => {
        if (!samplePromise) samplePromise = Promise.resolve(cloudSample);
        return samplePromise.then(run => run(prompt, options || {}));
      };
      sample.limits = async () => ({ images: true });
      return {
        app,
        auth,
        db,
        storeSdk,
        firestore,
        user: { id: async () => user.uid, canEdit: () => admin },
        qrCodes,
        sample
      };
    })().catch(error => {
      boot = null;
      throw error;
    });
    return boot;
  }

  window.claude = {
    use: async name => {
      if (name === "db" || name === "user" || name === "qr-codes" || name === "sample") {
        const state = await init();
        if (name === "db") return state.firestore;
        if (name === "user") return state.user;
        if (name === "qr-codes") return state.qrCodes;
        if (name === "sample") return state.sample;
      }
      if (name === "web-search") {
        if (!configured || !config.appCheckSiteKey || config.appCheckSiteKey.startsWith("PREENCHA_")) return null;
        const state = await init();
        const fnSdk = await import(sdkBase + "firebase-functions.js");
        const functions = fnSdk.getFunctions(state.app, "southamerica-east1");
        const callable = fnSdk.httpsCallable(functions, "answerWithWeb");
        return async payload => (await callable(payload)).data;
      }
      if (name === "downloads") return {
        save: async ({ filename, data }) => {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(new Blob([data], { type: "text/csv;charset=utf-8" }));
          link.download = filename;
          link.click();
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        }
      };
      return null;
    }
  };
})();
