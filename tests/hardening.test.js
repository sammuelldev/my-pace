import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { RECOMMENDATION_RULES } from "../js/data/recommendation-rules.js";
import { RESEARCH_SOURCES } from "../js/data/research-sources.js";
import { createDefaultState, normalizeState } from "../js/core/schema.js";
import { claimLegacyStateForUser, clearUserLocalData, userStorageKey } from "../js/core/storage.js";

test("todos os IDs HTML são únicos", () => {
  const html = readFileSync("index.html", "utf8");
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
});

test("login e identidade visual usam a nova marca sem elementos removidos", () => {
  const html = readFileSync("index.html", "utf8");
  const app = readFileSync("js/app.js", "utf8");
  assert.doesNotMatch(html, /MY PACE 2\.0|auth-orbit|auth-benefits|loading-ring/);
  assert.match(html, /dual-dot-loader/);
  assert.match(readFileSync("css/styles.css", "utf8"), /dual-dot-loader i:first-child[^}]*animation-duration:3\.2s/);
  assert.match(html, /assets\/mypace-runner\.png/);
  assert.equal(existsSync("assets/mypace-runner.png"), true);
  assert.equal(existsSync("assets/mypace-runner-icon.png"), true);
  assert.doesNotMatch(app, /PLANEJADO/);
});

test("onboarding limita o diálogo ao viewport e ocupa a tela no celular", () => {
  const css = readFileSync("css/styles.css", "utf8");
  assert.match(css, /\.onboarding-modal\{width:min\(calc\(100vw - 32px\),820px\)/);
  assert.match(css, /\.onboarding-modal\{width:100vw;height:100dvh/);
  assert.match(css, /\.onboarding-step\{[^}]*overflow-y:auto/);
});

test("service worker referencia apenas arquivos existentes do app shell", () => {
  const worker = readFileSync("service-worker.js", "utf8");
  const shellBlock = worker.match(/const APP_SHELL = \[([\s\S]*?)\];/)?.[1] || "";
  const paths = [...shellBlock.matchAll(/"\.\/([^"#?]*)"/g)].map(match => match[1]).filter(Boolean);
  assert.ok(paths.length >= 10);
  paths.forEach(path => assert.equal(existsSync(path), true, `${path} precisa existir`));
});

test("todas as fontes citadas pelas regras existem e têm URL HTTPS", () => {
  const sources = new Map(RESEARCH_SOURCES.map(source => [source.id, source]));
  RECOMMENDATION_RULES.flatMap(rule => rule.sourceIds || []).forEach(id => assert.ok(sources.has(id), `Fonte ausente: ${id}`));
  RESEARCH_SOURCES.forEach(source => assert.match(source.url, /^https:\/\//));
});

test("regras Firestore mantêm ownership e não liberam descendentes privados por wildcard", () => {
  const rules = readFileSync("firebase/firestore.rules", "utf8");
  assert.match(rules, /request\.auth\.uid == userId/);
  const userBlock = rules.slice(rules.indexOf("match /users/{userId}"), rules.indexOf("match /workoutLibrary"));
  assert.doesNotMatch(userBlock, /\{document=\*\*\}/);
  assert.match(userBlock, /privateCollection in \[/);
  assert.match(rules, /allow write: if false/);
});

test("normalização limita campos livres importados", () => {
  const state = createDefaultState(new Date("2026-09-01T12:00:00.000Z"));
  state.journal = [{ id: "note", date: "2026-09-01", mood: "invalid", note: "x".repeat(2000) }];
  const normalized = normalizeState(state, new Date("2026-09-01T12:00:00.000Z"));
  assert.equal(normalized.journal[0].note.length, 600);
  assert.equal(normalized.journal[0].mood, "neutral");
});

test("exclusão local remove cache do uid e legado reivindicado", () => {
  const state = createDefaultState(new Date("2026-09-01T12:00:00.000Z"));
  state.profile.name = "Amanda";
  const values = new Map([["pace-dashboard-portable-v1", JSON.stringify(state)]]);
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  claimLegacyStateForUser("uid-a", storage);
  values.set(userStorageKey("uid-a"), JSON.stringify(state));
  clearUserLocalData("uid-a", storage);
  assert.equal(values.has(userStorageKey("uid-a")), false);
  assert.equal(values.has("pace-dashboard-portable-v1"), false);
});
