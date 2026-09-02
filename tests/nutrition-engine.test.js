import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultState, normalizeState } from "../js/core/schema.js";
import { NUTRITION_LIBRARY } from "../js/data/nutrition-library.js";
import {
  TRAINING_DEMAND,
  classifyTrainingDemand,
  createNutritionFeedback,
  nutritionRecommendations,
  nutritionSlotStructure
} from "../js/domains/nutrition-engine.js";

const now = new Date("2026-09-01T12:00:00.000Z");
const longRun = { date: "2026-09-01", type: "Longão", category: "endurance", distance: 12, rpe: "5–6" };

function persistPlan(state, guidance, start = now) {
  guidance.slots.forEach((slot, index) => state.nutritionHistory.push(createNutritionFeedback({
    date: guidance.date, slot: slot.id, mealId: slot.selected.id, action: "selected"
  }, new Date(start.getTime() + index))));
}

test("biblioteca tem mais de 200 templates únicos e preserva IDs legados", () => {
  assert.ok(NUTRITION_LIBRARY.length >= 200);
  assert.equal(new Set(NUTRITION_LIBRARY.map(item => item.id)).size, NUTRITION_LIBRARY.length);
  assert.equal(new Set(NUTRITION_LIBRARY.map(item => item.name)).size, NUTRITION_LIBRARY.length);
  assert.equal(new Set(NUTRITION_LIBRARY.map(item => item.composition)).size, NUTRITION_LIBRARY.length);
  for (const slot of ["breakfast", "lunch", "snack", "dinner", "pre_run", "post_run", "post_strength", "supper"]) {
    assert.ok(NUTRITION_LIBRARY.filter(item => item.slotTypes.includes(slot)).length >= 10);
    assert.ok(NUTRITION_LIBRARY.filter(item => item.slotTypes.includes(slot) && item.patterns.includes("vegan")).length >= 5);
  }
  const legacyIds = ["banana-tapioca", "bread-banana", "couscous-eggs", "couscous-chicken", "rice-beans-chicken", "rice-beans-eggs", "rice-beans-tofu", "potato-chicken", "pasta-tomato", "yogurt-fruit-oats", "banana-milk-smoothie", "banana-soy-smoothie", "fruit-oats", "fruit-simple"];
  assert.ok(legacyIds.every(id => NUTRITION_LIBRARY.some(item => item.id === id)));
});

test("alergias e restrições são exclusões absolutas", () => {
  const state = createDefaultState(now);
  state.nutritionProfile.allergies = ["leite"];
  state.nutritionProfile.restrictions = ["sem glúten"];
  const options = nutritionRecommendations(state, longRun, "2026-09-01").slots.flatMap(slot => slot.options);
  assert.ok(options.length > 0);
  assert.ok(options.every(item => !item.allergens.includes("milk") && !item.allergens.includes("gluten")));
});

test("perfil vegano recebe apenas templates compatíveis", () => {
  const state = createDefaultState(now);
  state.nutritionProfile.pattern = "vegan";
  const options = nutritionRecommendations(state, longRun, "2026-09-01").slots.flatMap(slot => slot.options);
  assert.ok(options.length > 0);
  assert.ok(options.every(item => item.patterns.includes("vegan")));
});

test("IDs de refeição nunca se repetem no mesmo dia", () => {
  for (const preferredTime of ["morning", "afternoon", "evening", "variable"]) {
    const state = createDefaultState(now);
    state.trainingProfile.declared.preferredTime = preferredTime;
    const result = nutritionRecommendations(state, longRun, "2026-09-01");
    const ids = result.slots.map(slot => slot.selected.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("slots mudam pelo horário e mantêm almoço como refeição principal", () => {
  const state = createDefaultState(now);
  state.trainingProfile.declared.preferredTime = "morning";
  assert.deepEqual(nutritionSlotStructure(state, longRun).map(slot => slot.label), ["Antes da corrida", "Lanche pós-corrida", "Almoço", "Lanche da tarde", "Jantar"]);
  state.trainingProfile.declared.preferredTime = "afternoon";
  assert.deepEqual(nutritionSlotStructure(state, longRun).map(slot => slot.label), ["Café da manhã", "Almoço", "Antes da corrida", "Lanche pós-corrida", "Jantar"]);
  state.trainingProfile.declared.preferredTime = "evening";
  assert.deepEqual(nutritionSlotStructure(state, longRun).map(slot => slot.label), ["Café da manhã", "Almoço", "Lanche da tarde", "Antes da corrida", "Jantar pós-corrida"]);
  assert.deepEqual(nutritionSlotStructure(state, null).map(slot => slot.label), ["Café da manhã", "Almoço", "Lanche", "Jantar"]);
});

test("treino de força recebe contexto pós-força próprio", () => {
  const state = createDefaultState(now);
  const strength = { type: "Musculação", category: "strength", distance: 0, durationMinutes: 50, rpe: "6" };
  assert.ok(nutritionSlotStructure(state, strength).some(slot => slot.id === "post_strength"));
});

test("demanda combina tipo, duração, RPE, experiência e recuperação", () => {
  const state = createDefaultState(now);
  assert.equal(classifyTrainingDemand(state, null, "2026-09-01"), TRAINING_DEMAND.REST);
  assert.equal(classifyTrainingDemand(state, longRun, "2026-09-01"), TRAINING_DEMAND.LONG_ENDURANCE);
  assert.equal(classifyTrainingDemand(state, { ...longRun, race: true, category: "race" }, "2026-09-01"), TRAINING_DEMAND.RACE);
  assert.equal(classifyTrainingDemand(state, { type: "Recuperação", category: "recovery", distance: 3, rpe: "2–3" }, "2026-09-01"), TRAINING_DEMAND.RECOVERY_PRIORITY);
});

test("histórico recente reduz fortemente a repetição no dia seguinte", () => {
  const state = createDefaultState(now);
  const first = nutritionRecommendations(state, longRun, "2026-09-01");
  persistPlan(state, first);
  const next = nutritionRecommendations(state, { ...longRun, date: "2026-09-02" }, "2026-09-02");
  const previousIds = new Set(first.slots.map(slot => slot.selected.id));
  assert.ok(next.slots.every(slot => !previousIds.has(slot.selected.id)));
});

test("plano persistido permanece estável e uma troca altera somente um slot", () => {
  const state = createDefaultState(now);
  const first = nutritionRecommendations(state, longRun, "2026-09-01");
  persistPlan(state, first);
  const stable = nutritionRecommendations(state, longRun, "2026-09-01");
  assert.deepEqual(stable.slots.map(slot => slot.selected.id), first.slots.map(slot => slot.selected.id));
  const target = stable.slots.find(slot => slot.id === "pre_run");
  const alternative = target.options.find(item => item.id !== target.selected.id);
  state.nutritionHistory.push(createNutritionFeedback({ date: "2026-09-01", slot: target.id, mealId: alternative.id, action: "selected" }, new Date("2026-09-01T13:00:00.000Z")));
  const swapped = nutritionRecommendations(state, longRun, "2026-09-01");
  assert.equal(swapped.slots.find(slot => slot.id === target.id).selected.id, alternative.id);
  const unchanged = stable.slots.filter(slot => slot.id !== target.id).map(slot => slot.selected.id);
  assert.deepEqual(swapped.slots.filter(slot => slot.id !== target.id).map(slot => slot.selected.id), unchanged);
});

test("rejeição por segurança remove a refeição e registra o motivo", () => {
  const state = createDefaultState(now);
  const first = nutritionRecommendations(state, longRun, "2026-09-01");
  const target = first.slots[0];
  const feedback = createNutritionFeedback({ date: "2026-09-01", slot: target.id, mealId: target.selected.id, action: "rejected", reasonCode: "cannot-eat", blockedIngredient: "banana" }, now);
  state.nutritionHistory.push(feedback);
  const next = nutritionRecommendations(state, longRun, "2026-09-01");
  const normalizedFeedback = normalizeState(state, now).nutritionHistory.at(-1);
  assert.notEqual(next.slots[0].selected.id, target.selected.id);
  assert.equal(normalizedFeedback.reasonCode, "cannot-eat");
  assert.equal(normalizedFeedback.blockedIngredient, "banana");
});

test("pedido por outra opção troca o slot no mesmo dia sem virar bloqueio permanente", () => {
  const state = createDefaultState(now);
  const first = nutritionRecommendations(state, longRun, "2026-09-01");
  persistPlan(state, first);
  const target = first.slots.find(slot => slot.id === "lunch");
  state.nutritionHistory.push(createNutritionFeedback({ date: "2026-09-01", slot: target.id, mealId: target.selected.id, action: "rejected", reasonCode: "want-another" }, new Date("2026-09-01T13:00:00.000Z")));
  const swapped = nutritionRecommendations(state, longRun, "2026-09-01");
  assert.notEqual(swapped.slots.find(slot => slot.id === target.id).selected.id, target.selected.id);
  state.nutritionHistory.push(createNutritionFeedback({ date: "2026-11-01", slot: target.id, mealId: target.selected.id, action: "selected" }, new Date("2026-11-01T12:00:00.000Z")));
  const future = nutritionRecommendations(state, { ...longRun, date: "2026-11-01" }, "2026-11-01");
  assert.equal(future.slots.find(slot => slot.id === target.id).selected.id, target.selected.id);
});

test("perfis diferentes produzem planos diferentes de forma determinística", () => {
  const firstState = createDefaultState(now);
  firstState.nutritionProfile.goal = "practicality";
  firstState.nutritionProfile.pattern = "vegan";
  firstState.trainingProfile.declared.preferredTime = "morning";
  const secondState = createDefaultState(now);
  secondState.nutritionProfile.goal = "performance";
  secondState.nutritionProfile.pattern = "pescatarian";
  secondState.trainingProfile.declared.preferredTime = "evening";
  const first = nutritionRecommendations(firstState, longRun, "2026-09-01");
  const repeated = nutritionRecommendations(firstState, longRun, "2026-09-01");
  const second = nutritionRecommendations(secondState, longRun, "2026-09-01");
  assert.deepEqual(first.slots.map(slot => slot.selected.id), repeated.slots.map(slot => slot.selected.id));
  assert.notDeepEqual(first.slots.map(slot => slot.selected.id), second.slots.map(slot => slot.selected.id));
});
