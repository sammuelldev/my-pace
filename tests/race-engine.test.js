import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultState, normalizeRace, normalizeWorkout } from "../js/core/schema.js";
import { analyzeRaceResult, buildRaceExperience } from "../js/domains/race-engine.js";
import { createAdaptiveTrainingPlan } from "../js/domains/training-engine.js";

const now = new Date("2026-09-01T12:00:00.000Z");

test("semana da prova é identificada e prontidão mantém fatores transparentes", () => {
  const state = createDefaultState(now);
  state.races.push(normalizeRace({ id: "race", name: "5K", date: "2026-09-06", distance: 5, status: "planned", createdAt: "2026-08-01" }));
  const result = buildRaceExperience(state, now);
  assert.equal(result.active, true);
  assert.equal(result.raceWeek, true);
  assert.equal(result.daysToRace, 5);
  assert.ok(result.factors.length >= 2);
  assert.ok(result.score >= 0 && result.score <= 100);
});

test("análise pós-prova descreve parciais e recuperação sem prometer resultado", () => {
  const race = normalizeRace({
    id: "done", name: "5K", date: "2026-08-30", distance: 5, status: "completed",
    result: { officialSeconds: 1560, distance: 5, splits: [320, 315, 312, 308, 305], rpe: 9, recoveryNeed: "high" }
  });
  const analysis = analyzeRaceResult(race);
  assert.match(analysis.pacing, /segunda metade|estáveis/i);
  assert.match(analysis.recovery, /recuperação/i);
  assert.equal(analysis.engineVersion, 1);
});

test("plano após prova prioriza recuperação", () => {
  const state = createDefaultState(now);
  state.trainingProfile.declared.trainingDays = [2, 4, 6];
  state.races.push(normalizeRace({
    id: "done", name: "5K", date: "2026-08-31", distance: 5, status: "completed",
    result: { officialSeconds: 1600, distance: 5, splits: [], rpe: 9, recoveryNeed: "high" }
  }));
  state.workouts.push(normalizeWorkout({ id: "run", date: "2026-08-25", distance: 4, durationSeconds: 1600, rpe: 4 }));
  const [first] = createAdaptiveTrainingPlan(state, now);
  assert.equal(first.date, "2026-09-01");
  assert.equal(first.workoutId, "recovery-run");
});
