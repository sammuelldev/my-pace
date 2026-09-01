import { firebaseConfig } from "./firebase-config.js";

const SDK_VERSION = "12.18.0";
let services = null;
let auth = null;
let db = null;
const cloudCache = new Map();

const COLLECTIONS = {
  workouts: "workouts",
  races: "races",
  weights: "bodyMetrics",
  equipment: "equipment",
  nutritionHistory: "nutritionHistory",
  recommendationFeedback: "recommendationFeedback",
  achievements: "achievements",
  journal: "journal"
};

const clone = value => JSON.parse(JSON.stringify(value));
const comparable = value => JSON.stringify(value ?? null);

export function firebaseIsConfigured() {
  const required = ["apiKey", "authDomain", "projectId", "storageBucket", "appId"];
  return required.every(key => {
    const value = String(firebaseConfig[key] || "");
    return value && !/COLE_|SEU_PROJETO/.test(value);
  });
}

async function loadFirebase() {
  if (services) return services;
  const base = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
  const [appSdk, authSdk, firestoreSdk] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`)
  ]);
  services = { ...appSdk, ...authSdk, ...firestoreSdk };
  return services;
}

export async function initializeCloud(onUser, onError) {
  if (!firebaseIsConfigured()) return { configured: false };
  try {
    const sdk = await loadFirebase();
    const app = sdk.initializeApp(firebaseConfig);
    auth = sdk.getAuth(app);
    db = sdk.getFirestore(app);
    await sdk.setPersistence(auth, sdk.browserLocalPersistence);
    sdk.onAuthStateChanged(auth, onUser, onError);
    return { configured: true };
  } catch (error) {
    onError(error);
    return { configured: true, error };
  }
}

export async function signInCloud(email, password) {
  if (!auth || !services) throw new Error("Firebase ainda não foi inicializado.");
  return services.signInWithEmailAndPassword(auth, email, password);
}

export async function createCloudAccount(email, password, displayName) {
  if (!auth || !services) throw new Error("Firebase ainda não foi inicializado.");
  const credential = await services.createUserWithEmailAndPassword(auth, email, password);
  const name = String(displayName || "").trim().slice(0, 40);
  if (name) await services.updateProfile(credential.user, { displayName: name });
  return credential;
}

export async function sendCloudPasswordReset(email) {
  if (!auth || !services) throw new Error("Firebase ainda não foi inicializado.");
  return services.sendPasswordResetEmail(auth, email);
}

export async function signInWithGoogle() {
  if (!auth || !services) throw new Error("Firebase ainda não foi inicializado.");
  const provider = new services.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return services.signInWithPopup(auth, provider);
}

export async function signOutCloud() {
  if (auth && services) await services.signOut(auth);
}

export function currentCloudUser() {
  return auth?.currentUser || null;
}

export async function deleteCloudAccount(uid) {
  if (!db || !services || !auth?.currentUser || auth.currentUser.uid !== uid) throw new Error("auth/requires-recent-login");
  const collectionNames = [...Object.values(COLLECTIONS), "readiness", "pace"];
  for (const collectionName of collectionNames) {
    const snapshot = await services.getDocs(services.collection(db, "users", uid, collectionName));
    for (let index = 0; index < snapshot.docs.length; index += 400) {
      const batch = services.writeBatch(db);
      snapshot.docs.slice(index, index + 400).forEach(item => batch.delete(item.ref));
      await batch.commit();
    }
  }
  await services.deleteDoc(services.doc(db, "users", uid));
  cloudCache.delete(uid);
  await services.deleteUser(auth.currentUser);
}

function rootDataFromState(state) {
  return clone({
    schemaVersion: state.schemaVersion || state.version || 4,
    profile: state.profile,
    goals: state.goals,
    trainingProfile: state.trainingProfile,
    nutritionProfile: state.nutritionProfile,
    onboarding: state.onboarding,
    settings: state.settings,
    raceChecklist: state.raceChecklist,
    meta: state.meta
  });
}

function itemsById(items = []) {
  return new Map(items.filter(item => item?.id).map(item => [String(item.id), clone(item)]));
}

function stateCollections(state) {
  const result = Object.fromEntries(Object.keys(COLLECTIONS).map(key => [key, itemsById(state[key])]));
  result.readiness = new Map(Object.entries(state.readiness || {}).map(([date, value]) => [date, { ...clone(value), id: date, date }]));
  return result;
}

async function readCollection(uid, collectionName) {
  const snapshot = await services.getDocs(services.collection(db, "users", uid, collectionName));
  return snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
}

async function readGranularState(uid, rootData) {
  const keys = Object.keys(COLLECTIONS);
  const [readinessItems, ...collections] = await Promise.all([
    readCollection(uid, "readiness"),
    ...keys.map(key => readCollection(uid, COLLECTIONS[key]))
  ]);
  const state = {
    ...clone(rootData),
    readiness: Object.fromEntries(readinessItems.map(item => [item.id, item])),
    ...Object.fromEntries(keys.map((key, index) => [key, collections[index]]))
  };
  delete state.remoteUpdatedAt;
  delete state.legacyMigratedAt;
  cloudCache.set(uid, clone(state));
  return state;
}

async function readLegacyState(uid) {
  const legacy = await services.getDoc(services.doc(db, "users", uid, "pace", "dashboard"));
  return legacy.exists() && legacy.data()?.state ? legacy.data().state : null;
}

export function watchCloudState(uid, onData, onError) {
  if (!db || !services) return () => {};
  const target = services.doc(db, "users", uid);
  return services.onSnapshot(target, async snapshot => {
    try {
      if (snapshot.exists()) {
        onData(await readGranularState(uid, snapshot.data()), { source: "granular" });
        return;
      }
      const legacy = await readLegacyState(uid);
      if (legacy) cloudCache.set(uid, clone(legacy));
      onData(legacy, { source: legacy ? "legacy" : "empty" });
    } catch (error) { onError(error); }
  }, onError);
}

export async function saveCloudState(uid, state) {
  if (!db || !services || !uid) return;
  const previous = cloudCache.get(uid) || {};
  const previousCollections = stateCollections(previous);
  const nextCollections = stateCollections(state);
  const operations = [];

  for (const [stateKey, collectionName] of [...Object.entries(COLLECTIONS), ["readiness", "readiness"]]) {
    const before = previousCollections[stateKey] || new Map();
    const after = nextCollections[stateKey] || new Map();
    for (const [id, data] of after) {
      if (comparable(before.get(id)) !== comparable(data)) {
        operations.push({ kind: "set", ref: services.doc(db, "users", uid, collectionName, id), data });
      }
    }
    for (const id of before.keys()) {
      if (!after.has(id)) operations.push({ kind: "delete", ref: services.doc(db, "users", uid, collectionName, id) });
    }
  }

  for (let index = 0; index < operations.length; index += 400) {
    const batch = services.writeBatch(db);
    operations.slice(index, index + 400).forEach(operation => {
      if (operation.kind === "set") batch.set(operation.ref, operation.data);
      else batch.delete(operation.ref);
    });
    await batch.commit();
  }

  const rootData = rootDataFromState(state);
  const previousRoot = rootDataFromState(previous);
  if (comparable(rootData) !== comparable(previousRoot) || operations.length) {
    await services.setDoc(services.doc(db, "users", uid), {
      ...rootData,
      remoteUpdatedAt: services.serverTimestamp(),
      legacyMigratedAt: state.meta?.migratedFrom ? services.serverTimestamp() : null
    }, { merge: true });
  }
  cloudCache.set(uid, clone(state));
}

export async function uploadProfilePhoto(uid, dataUrl) {
  // A foto já chega recortada e comprimida. Ela é salva como Data URL no
  // documento privado do Firestore para manter esta versão no plano gratuito.
  return dataUrl;
}

export async function removeCloudProfilePhoto() {}

export function friendlyFirebaseError(error) {
  const messages = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/invalid-email": "Digite um e-mail válido.",
    "auth/email-already-in-use": "Já existe uma conta com este e-mail.",
    "auth/weak-password": "Use uma senha com pelo menos 6 caracteres.",
    "auth/requires-recent-login": "Por segurança, saia e entre novamente antes de excluir a conta.",
    "auth/user-not-found": "Se este e-mail estiver cadastrado, você receberá as instruções de recuperação.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/network-request-failed": "Sem conexão com a internet.",
    "auth/popup-closed-by-user": "A janela de login foi fechada antes da conclusão.",
    "auth/popup-blocked": "O navegador bloqueou a janela de login. Permita pop-ups e tente novamente.",
    "auth/operation-not-allowed": "Ative esse método de login no Firebase Authentication.",
    "auth/user-disabled": "Esta conta foi desativada.",
    "permission-denied": "Acesso negado. Confira as regras do Firebase.",
    "resource-exhausted": "O limite gratuito foi atingido. Tente novamente mais tarde."
  };
  return messages[error?.code] || "Não foi possível conectar ao Firebase. Confira a configuração e tente novamente.";
}
