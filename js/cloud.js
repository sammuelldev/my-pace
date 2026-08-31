import { firebaseConfig } from "./firebase-config.js";

const SDK_VERSION = "12.18.0";
let services = null;
let auth = null;
let db = null;

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

export async function signOutCloud() {
  if (auth && services) await services.signOut(auth);
}

export function watchCloudState(uid, onData, onError) {
  if (!db || !services) return () => {};
  const target = services.doc(db, "users", uid, "pace", "dashboard");
  return services.onSnapshot(target, snapshot => {
    onData(snapshot.exists() ? snapshot.data().state : null);
  }, onError);
}

export async function saveCloudState(uid, state) {
  if (!db || !services || !uid) return;
  const target = services.doc(db, "users", uid, "pace", "dashboard");
  await services.setDoc(target, {
    state: JSON.parse(JSON.stringify(state)),
    updatedAt: services.serverTimestamp()
  });
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
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente novamente.",
    "auth/network-request-failed": "Sem conexão com a internet.",
    "auth/user-disabled": "Esta conta foi desativada.",
    "permission-denied": "Acesso negado. Confira as regras do Firebase.",
    "resource-exhausted": "O limite gratuito foi atingido. Tente novamente mais tarde."
  };
  return messages[error?.code] || "Não foi possível conectar ao Firebase. Confira a configuração e tente novamente.";
}
