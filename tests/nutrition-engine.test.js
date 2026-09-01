import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultState } from "../js/core/schema.js";
import { createNutritionFeedback, nutritionRecommendations } from "../js/domains/nutrition-engine.js";

const now = new Date("2026-09-01T12:00:00.000Z");
const session = { date: "2026-09-01", type: "Longão", category: "endurance", distance: 8, rpe: "4–5" };

test("alergias e restrições removem opções incompatíveis", () => {
  const state = createDefaultState(now);
  state.nutritionProfile.allergies = ["leite"];
  state.nutritionProfile.restrictions = ["sem glúten"];
  const result = nutritionRecommendations(state, session, "2026-09-01");
  const options = result.slots.flatMap(slot => slot.options);
  assert.ok(options.length > 0);
  assert.ok(options.every(item => !item.allergens.includes("milk") && !item.allergens.includes("gluten")));
});

test("perfil vegano não recebe refeições com ovos, leite ou frango", () => {
  const state = createDefaultState(now);
  state.nutritionProfile.pattern = "vegan";
  const result = nutritionRecommendations(state, session, "2026-09-01");
  const ingredients = result.slots.flatMap(slot => slot.options.flatMap(item => item.ingredients));
  assert.ok(!ingredients.includes("ovos"));
  assert.ok(!ingredients.includes("leite"));
  assert.ok(!ingredients.includes("frango"));
});

test("seleção e feedback alteram a recomendação de forma determinística", () => {
  const state = createDefaultState(now);
  const first = nutritionRecommendations(state, session, "2026-09-01");
  const afterSlot = first.slots.find(slot => slot.id === "after");
  const alternative = afterSlot.options.find(item => item.id !== afterSlot.selected.id);
  state.nutritionHistory.push(createNutritionFeedback({ date: "2026-09-01", slot: "after", mealId: alternative.id, action: "selected" }, now));
  const selected = nutritionRecommendations(state, session, "2026-09-01");
  assert.equal(selected.slots.find(slot => slot.id === "after").selected.id, alternative.id);
  state.nutritionHistory.push(createNutritionFeedback({ date: "2026-09-02", slot: "after", mealId: alternative.id, action: "liked" }, new Date("2026-09-02T12:00:00.000Z")));
  const ranked = nutritionRecommendations(state, session, "2026-09-03");
  assert.equal(ranked.slots.find(slot => slot.id === "after").options[0].id, alternative.id);
});
