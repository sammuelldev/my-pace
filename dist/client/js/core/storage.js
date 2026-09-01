import { LEGACY_BACKUP_KEY, SCHEMA_VERSION, STORAGE_KEY, hasMeaningfulData, normalizeState, touchState } from "./schema.js";

const LEGACY_CLAIM_KEY = "mypace-legacy-data-claimed-by";

export function userStorageKey(uid) {
  return `mypace-user-${String(uid || "anonymous").replace(/[^a-zA-Z0-9_-]/g, "")}-v4`;
}

function parseJSON(value) {
  try { return value ? JSON.parse(value) : null; }
  catch (_) { return null; }
}

export function loadLocalState(storage = globalThis.localStorage, key = STORAGE_KEY) {
  const raw = parseJSON(storage?.getItem(key));
  if (!raw) return normalizeState(null);
  const sourceVersion = Number(raw.schemaVersion || raw.version || 1);
  if (key === STORAGE_KEY && sourceVersion < SCHEMA_VERSION && !storage.getItem(LEGACY_BACKUP_KEY)) {
    storage.setItem(LEGACY_BACKUP_KEY, JSON.stringify({ backedUpAt: new Date().toISOString(), sourceVersion, state: raw }));
  }
  const migrated = normalizeState(raw);
  if (sourceVersion < SCHEMA_VERSION) {
    migrated.meta.legacyBackupCreated = true;
    storage.setItem(key, JSON.stringify(migrated));
  }
  return migrated;
}

export function saveLocalState(state, storage = globalThis.localStorage, key = STORAGE_KEY) {
  const saved = touchState(state);
  storage?.setItem(key, JSON.stringify(saved));
  return saved;
}

export function claimLegacyStateForUser(uid, storage = globalThis.localStorage) {
  const claimant = storage?.getItem(LEGACY_CLAIM_KEY);
  if (claimant && claimant !== uid) return null;
  const legacy = loadLocalState(storage, STORAGE_KEY);
  if (!hasMeaningfulData(legacy)) return null;
  storage?.setItem(LEGACY_CLAIM_KEY, uid);
  return legacy;
}

function mergeById(remoteItems = [], localItems = []) {
  const merged = new Map();
  [...remoteItems, ...localItems].forEach(item => {
    const current = merged.get(item.id);
    if (!current || String(item.updatedAt || item.date || "") >= String(current.updatedAt || current.date || "")) merged.set(item.id, item);
  });
  return [...merged.values()];
}

export function mergeLocalAndRemote(localInput, remoteInput) {
  const local = normalizeState(localInput);
  const remote = normalizeState(remoteInput);
  if (!hasMeaningfulData(remoteInput)) return local;
  if (!hasMeaningfulData(localInput)) return remote;
  const localIsNewer = String(local.meta.lastLocalChangeAt || "") > String(remote.meta.updatedAt || "");
  const preferred = localIsNewer ? local : remote;
  const secondary = localIsNewer ? remote : local;
  return normalizeState({
    ...secondary,
    ...preferred,
    profile: { ...secondary.profile, ...preferred.profile },
    goals: { ...secondary.goals, ...preferred.goals },
    trainingProfile: { declared: { ...secondary.trainingProfile.declared, ...preferred.trainingProfile.declared } },
    nutritionProfile: { ...secondary.nutritionProfile, ...preferred.nutritionProfile },
    onboarding: { ...secondary.onboarding, ...preferred.onboarding },
    settings: { ...secondary.settings, ...preferred.settings },
    workouts: mergeById(remote.workouts, local.workouts),
    races: mergeById(remote.races, local.races),
    weights: mergeById(remote.weights, local.weights),
    equipment: mergeById(remote.equipment, local.equipment),
    nutritionHistory: mergeById(remote.nutritionHistory, local.nutritionHistory),
    recommendationFeedback: mergeById(remote.recommendationFeedback, local.recommendationFeedback),
    achievements: mergeById(remote.achievements, local.achievements),
    journal: mergeById(remote.journal, local.journal),
    readiness: { ...remote.readiness, ...local.readiness },
    raceChecklist: { ...remote.raceChecklist, ...local.raceChecklist },
    meta: { ...secondary.meta, ...preferred.meta, updatedAt: new Date().toISOString(), migratedFrom: preferred.meta.migratedFrom || secondary.meta.migratedFrom }
  });
}

export function getLegacyBackup(storage = globalThis.localStorage) {
  return parseJSON(storage?.getItem(LEGACY_BACKUP_KEY));
}
