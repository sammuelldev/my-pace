import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultState, normalizeWorkout } from "../js/core/schema.js";
import { buildProgressInsights, reconcileAchievements } from "../js/domains/progress-engine.js";

const now = new Date("2026-09-01T12:00:00.000Z");

function stateWithRuns(count = 6) {
  const state = createDefaultState(now);
  state.trainingProfile.declared.experience = "recreational";
  state.trainingProfile.declared.currentWeeklyKm = 15;
  state.workouts = Array.from({ length: count }, (_, index) => normalizeWorkout({
    id: `run-${index}`, date: `2026-08-${String(8 + index * 4).padStart(2, "0")}`,
    distance: index === 2 ? 5 : 4 + index * 0.2, durationSeconds: 1680 + index * 60,
    rpe: 4, type: "Corrida leve", updatedAt: `2026-08-${String(8 + index * 4).padStart(2, "0")}T12:00:00.000Z`
  }));
  return state;
}

test("estimativa fica bloqueada sem dados suficientes", () => {
  const result = buildProgressInsights(createDefaultState(now), now);
  assert.equal(result.raceEstimate.available, false);
  assert.ok(result.raceEstimate.requiredRuns > 0);
  assert.equal(result.personalRecords.find(item => item.distance === 5).available, false);
});

test("recordes e estimativa aparecem somente com amostra observada", () => {
  const result = buildProgressInsights(stateWithRuns(), now);
  assert.equal(result.personalRecords.find(item => item.distance === 5).available, true);
  assert.equal(result.raceEstimate.available, true);
  assert.ok(result.raceEstimate.lowSeconds < result.raceEstimate.highSeconds);
  assert.equal(result.raceEstimate.evidenceStatus, "internal-estimation-heuristic");
});

test("conquistas são idempotentes e alimentam a linha do tempo", () => {
  const state = stateWithRuns();
  state.journal.push({ id: "note-1", date: "2026-08-31", note: "Treino leve e confortável", mood: "good" });
  const once = reconcileAchievements(state);
  state.achievements = once;
  const twice = reconcileAchievements(state);
  assert.deepEqual(twice, once);
  const result = buildProgressInsights(state, now);
  assert.ok(result.achievements.some(item => item.id === "first-run"));
  assert.ok(result.achievements.some(item => item.id === "five-runs"));
  assert.ok(result.timeline.some(item => item.type === "journal"));
});

test("My Pace Score expõe dimensões e não se apresenta como diagnóstico", () => {
  const result = buildProgressInsights(stateWithRuns(), now);
  assert.ok(result.paceScore.score >= 0 && result.paceScore.score <= 100);
  assert.deepEqual(Object.keys(result.paceScore.dimensions), ["consistency", "feedback", "data", "continuity"]);
});
