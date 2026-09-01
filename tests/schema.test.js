import test from "node:test";
import assert from "node:assert/strict";
import { LEGACY_BACKUP_KEY, SCHEMA_VERSION, STORAGE_KEY, normalizeState } from "../js/core/schema.js";
import { claimLegacyStateForUser, loadLocalState, mergeLocalAndRemote, userStorageKey } from "../js/core/storage.js";

const fixedNow = new Date("2026-09-01T12:00:00.000Z");

function legacyState() {
  return {
    version: 3,
    profile: { name: "Samuel", photo: null },
    workouts: [{ id: "run-1", date: "2026-08-30", distance: 5, durationSeconds: 1600, rpe: "6", type: "Tempo run" }],
    weights: [{ id: "weight-1", date: "2026-08-30", weight: 50.2 }],
    equipment: [{ id: "shoe-1", name: "Tênis de treino", lifespan: 600, totalKm: 40 }],
    races: [],
    readiness: { "2026-09-01": { sleep: 4, energy: 3, soreness: 2 } },
    settings: { onboarded: true, primaryGoal: "5k", weeklyGoal: 18, theme: "dark" }
  };
}

test("migra v3 para v4 sem perder os dados existentes", () => {
  const migrated = normalizeState(legacyState(), fixedNow);
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.profile.name, "Samuel");
  assert.equal(migrated.workouts[0].id, "run-1");
  assert.equal(migrated.weights[0].weight, 50.2);
  assert.equal(migrated.equipment[0].name, "Tênis de treino");
  assert.equal(migrated.goals.primary, "5k");
  assert.equal(migrated.onboarding.completed, true);
  assert.equal(migrated.meta.migratedFrom, 3);
});

test("normalização do schema v4 é idempotente", () => {
  const once = normalizeState(legacyState(), fixedNow);
  const twice = normalizeState(once, fixedNow);
  assert.deepEqual(twice, once);
});

test("primeira leitura cria um backup do payload legado", () => {
  const values = new Map([[STORAGE_KEY, JSON.stringify(legacyState())]]);
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  const migrated = loadLocalState(storage);
  const backup = JSON.parse(values.get(LEGACY_BACKUP_KEY));
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(backup.sourceVersion, 3);
  assert.equal(backup.state.profile.name, "Samuel");
});

test("merge preserva itens locais e remotos sem duplicar IDs", () => {
  const local = normalizeState(legacyState(), fixedNow);
  local.workouts.push({ ...local.workouts[0], id: "local-2", date: "2026-09-01" });
  local.meta.lastLocalChangeAt = "2026-09-01T13:00:00.000Z";
  const remote = normalizeState({ ...legacyState(), profile: { name: "Samuel Nuvem" } }, fixedNow);
  remote.workouts.push({ ...remote.workouts[0], id: "remote-2", date: "2026-08-31" });
  remote.meta.updatedAt = "2026-09-01T12:30:00.000Z";
  const merged = mergeLocalAndRemote(local, remote);
  assert.equal(merged.profile.name, "Samuel");
  assert.deepEqual(new Set(merged.workouts.map(item => item.id)), new Set(["run-1", "local-2", "remote-2"]));
});

test("cache local fica isolado por uid e o legado só pode ser reivindicado por uma conta", () => {
  const values = new Map([[STORAGE_KEY, JSON.stringify(legacyState())]]);
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  assert.notEqual(userStorageKey("user-a"), userStorageKey("user-b"));
  assert.equal(claimLegacyStateForUser("user-a", storage).profile.name, "Samuel");
  assert.equal(claimLegacyStateForUser("user-b", storage), null);
});
