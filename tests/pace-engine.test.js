import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultState, normalizeWorkout } from "../js/core/schema.js";
import { buildAthleteModel, explainTrainingRecommendation } from "../js/domains/pace-engine.js";

const now = new Date("2026-09-01T12:00:00.000Z");

function workout(id, date, distance, minutes, rpe = 4) {
  return normalizeWorkout({ id, date, distance, durationSeconds: minutes * 60, rpe, type: "Corrida leve", updatedAt: `${date}T12:00:00.000Z` });
}

test("perfil sem observações usa declaração e confiança baixa", () => {
  const state = createDefaultState(now);
  state.trainingProfile.declared.currentWeeklyKm = 9;
  state.trainingProfile.declared.longestRunKm = 4;
  state.trainingProfile.declared.typicalPaceSeconds = 390;
  const model = buildAthleteModel(state, now);
  assert.equal(model.capabilities.source, "declared");
  assert.equal(model.capabilities.typicalPaceSeconds, 390);
  assert.equal(model.confidence.level, "low");
  assert.equal(model.observed.sampleSize, 0);
});

test("perfil observado passa a prevalecer após amostra mínima", () => {
  const state = createDefaultState(now);
  state.workouts = [
    workout("a", "2026-08-10", 4, 28),
    workout("b", "2026-08-17", 5, 34),
    workout("c", "2026-08-24", 5, 33),
    workout("d", "2026-08-31", 6, 39)
  ];
  const model = buildAthleteModel(state, now);
  assert.equal(model.capabilities.source, "observed");
  assert.equal(model.observed.sampleSize, 4);
  assert.ok(model.capabilities.baseDistanceKm >= 4);
  assert.ok(model.observed.typicalPaceSeconds > 0);
});

test("explicação expõe regra, motivo e confiança sem caixa-preta", () => {
  const state = createDefaultState(now);
  state.readiness["2026-09-01"] = { sleep: 1, energy: 1, soreness: 5 };
  const model = buildAthleteModel(state, now);
  const result = explainTrainingRecommendation({ date: "2026-09-01", type: "Corrida leve" }, state, model);
  assert.ok(result.recommendation.reasonCodes.includes("low-readiness"));
  assert.ok(result.recommendation.sourceRuleIds.includes("training-readiness-low"));
  assert.ok(result.recommendation.explanations.length >= 2);
  assert.equal(result.recommendation.engineVersion, 1);
});
