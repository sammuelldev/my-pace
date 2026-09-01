import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultState } from "../js/core/schema.js";
import { applyOnboardingStep, completeOnboarding, onboardingStep } from "../js/domains/onboarding.js";

const now = new Date("2026-09-01T12:00:00.000Z");

test("onboarding salva etapas progressivamente e cria uma prova opcional", () => {
  let state = createDefaultState(now);
  state = applyOnboardingStep(state, "welcome", {}, now);
  state = applyOnboardingStep(state, "basics", { name: "Amanda", city: "Fortaleza", currentWeight: 60 }, now);
  state = applyOnboardingStep(state, "history", { experience: "beginner", currentWeeklyKm: 8, longestRunKm: 4, typicalPace: "6:30" }, now);
  state = applyOnboardingStep(state, "availability", { trainingDays: [1, 3, 6], preferredTime: "morning", sessionMinutes: 45 }, now);
  state = applyOnboardingStep(state, "goals", { primaryGoal: "5k", targetWeeklyKm: 12, motivation: "Minha primeira prova" }, now);
  state = applyOnboardingStep(state, "race", { hasRace: true, raceName: "5K da Cidade", raceDate: "2026-11-01", raceDistance: 5 }, now);
  assert.equal(state.profile.name, "Amanda");
  assert.equal(state.trainingProfile.declared.typicalPaceSeconds, 390);
  assert.deepEqual(state.trainingProfile.declared.trainingDays, [1, 3, 6]);
  assert.equal(state.races[0].name, "5K da Cidade");
  assert.equal(state.weights[0].weight, 60);
  assert.ok(onboardingStep(state) > 0);
});

test("conclusão mantém o perfil e marca a rota como liberada", () => {
  let state = createDefaultState(now);
  state.profile.name = "Amanda";
  state = completeOnboarding(state, now);
  assert.equal(state.onboarding.completed, true);
  assert.equal(state.settings.onboarded, true);
  assert.equal(state.profile.name, "Amanda");
  assert.equal(state.onboarding.completedAt, now.toISOString());
});
