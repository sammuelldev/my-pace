import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultState, normalizeWorkout } from "../js/core/schema.js";
import { createAdaptiveTrainingPlan, createTrainingDecision, workoutSubstitutions } from "../js/domains/training-engine.js";

const now = new Date("2026-09-01T12:00:00.000Z"); // terça-feira

function trainedState() {
  const state = createDefaultState(now);
  state.trainingProfile.declared.experience = "recreational";
  state.trainingProfile.declared.currentWeeklyKm = 15;
  state.trainingProfile.declared.longestRunKm = 7;
  state.trainingProfile.declared.trainingDays = [2, 4, 6];
  state.workouts = Array.from({ length: 6 }, (_, index) => {
    const day = String(5 + index * 4).padStart(2, "0");
    return normalizeWorkout({ id: `run-${index}`, date: `2026-08-${day}`, distance: 5, durationSeconds: 1800 + index * 5, rpe: 4, updatedAt: `2026-08-${day}T12:00:00.000Z` });
  });
  return state;
}

test("calendário respeita somente os dias declarados", () => {
  const state = trainedState();
  state.trainingProfile.declared.trainingDays = [2, 5];
  const plan = createAdaptiveTrainingPlan(state, now);
  assert.ok(plan.length > 3);
  assert.ok(plan.every(item => [2, 5].includes(new Date(`${item.date}T12:00:00`).getDay())));
});

test("baixa prontidão troca a sessão do dia por recuperação", () => {
  const state = trainedState();
  state.readiness["2026-09-01"] = { sleep: 1, energy: 1, soreness: 5 };
  const [today] = createAdaptiveTrainingPlan(state, now);
  assert.equal(today.date, "2026-09-01");
  assert.equal(today.workoutId, "recovery-run");
  assert.ok(today.recommendation.reasonCodes.includes("low-readiness"));
});

test("treino perdido não é acumulado e torna a retomada conservadora", () => {
  const state = trainedState();
  const initial = createAdaptiveTrainingPlan(state, now);
  state.recommendationFeedback.push(createTrainingDecision(initial[0], "missed", null, now));
  const adapted = createAdaptiveTrainingPlan(state, now);
  assert.notEqual(adapted[0].date, initial[0].date);
  assert.ok(adapted[0].recommendation.reasonCodes.includes("no-missed-compensation"));
});

test("substituição escolhida reaparece no mesmo dia", () => {
  const state = trainedState();
  const initial = createAdaptiveTrainingPlan(state, now);
  const replacement = workoutSubstitutions(initial[0]).find(item => item.workoutId === "run-walk") || workoutSubstitutions(initial[0])[0];
  state.recommendationFeedback.push(createTrainingDecision(initial[0], "substituted", replacement.workoutId, now));
  const adapted = createAdaptiveTrainingPlan(state, now);
  assert.equal(adapted[0].date, initial[0].date);
  assert.equal(adapted[0].workoutId, replacement.workoutId);
  assert.equal(adapted[0].substituted, true);
});
