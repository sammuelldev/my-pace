import { NUTRITION_LIBRARY } from "../data/nutrition-library.js";

export const NUTRITION_ENGINE_VERSION = 1;

const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const localISO = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function excludedAllergens(profile) {
  const values = [...(profile.allergies || []), ...(profile.restrictions || [])].map(normalize);
  const excluded = new Set();
  values.forEach(value => {
    if (/leite|lactose|milk/.test(value)) excluded.add("milk");
    if (/gluten|trigo/.test(value)) excluded.add("gluten");
    if (/ovo|egg/.test(value)) excluded.add("egg");
    if (/soja|soy/.test(value)) excluded.add("soy");
    if (/amendoim|peanut/.test(value)) excluded.add("peanut");
    excluded.add(value);
  });
  return excluded;
}

function isAllowed(item, profile) {
  const pattern = profile.pattern || "omnivore";
  if (!item.patterns.includes(pattern) && pattern !== "omnivore") return false;
  const excluded = excludedAllergens(profile);
  if (item.allergens.some(allergen => excluded.has(normalize(allergen)))) return false;
  const dislikes = (profile.dislikes || []).map(normalize);
  if (item.ingredients.some(ingredient => dislikes.some(dislike => dislike && normalize(ingredient).includes(dislike)))) return false;
  if (profile.cookingTime === "low" && item.prep !== "low") return false;
  if (profile.budget === "low" && item.budget === "high") return false;
  return true;
}

function feedbackScore(item, state) {
  const history = (state.nutritionHistory || []).filter(entry => entry.mealId === item.id);
  const preference = history.reduce((score, entry) => score + (entry.action === "liked" ? 4 : entry.action === "disliked" ? -8 : entry.action === "selected" ? 2 : 0), 0);
  const favorites = (state.nutritionProfile?.favorites || []).map(normalize);
  const favoriteScore = item.ingredients.some(ingredient => favorites.some(favorite => favorite && normalize(ingredient).includes(favorite))) ? 3 : 0;
  return preference + favoriteScore;
}

function optionsFor(context, state) {
  return NUTRITION_LIBRARY
    .filter(item => item.contexts.includes(context) && isAllowed(item, state.nutritionProfile || {}))
    .map(item => ({ ...item, score: feedbackScore(item, state) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 5);
}

function selectedMealId(state, date, slot) {
  return [...(state.nutritionHistory || [])].reverse().find(entry => entry.date === date && entry.slot === slot && entry.action === "selected")?.mealId || null;
}

function sessionContext(session) {
  if (!session || session.category === "rest") return { level: "Dia sem corrida", focus: "Regularidade e variedade ao longo do dia" };
  if (session.race) return { level: "Dia de prova", focus: "Use somente alimentos e horários já testados" };
  if (["quality", "endurance", "test"].includes(session.category)) return { level: session.type, focus: "Chegue com energia e priorize recuperação depois" };
  return { level: session.type, focus: "Mantenha uma refeição confortável antes e rotina normal depois" };
}

export function nutritionRecommendations(state, session = null, date = localISO()) {
  const context = sessionContext(session);
  const slots = [
    { id: "before", label: "Antes", context: "before", reason: session ? "Opção simples para chegar ao treino sem testar novidades." : "Uma opção prática para manter regularidade." },
    { id: "after", label: "Depois", context: "after", reason: session ? "Combina fontes alimentares úteis à recuperação da sessão." : "Refeição completa para a rotina do dia." },
    { id: "regular", label: "Outra refeição", context: "regular", reason: "Ajuda a variar alimentos respeitando suas preferências." }
  ].map(slot => {
    const options = optionsFor(slot.context, state);
    const selectedId = selectedMealId(state, date, slot.id);
    const selected = options.find(item => item.id === selectedId) || options[0] || null;
    return { ...slot, selected, options };
  });
  return {
    engineVersion: NUTRITION_ENGINE_VERSION,
    date,
    level: context.level,
    focus: context.focus,
    slots,
    hydration: session ? "Distribua água ao longo do dia e ajuste pelas condições, duração e sua sede." : "Mantenha água disponível ao longo do dia.",
    sourceIds: ["acsm-nutrition-performance-2016"],
    safetyNote: "Sugestões organizacionais gerais; alergias, condições clínicas e necessidades individuais devem ser avaliadas por nutricionista."
  };
}

export function createNutritionFeedback({ date, slot, mealId, action }, now = new Date()) {
  return {
    id: `nutrition-${date}-${slot}-${now.getTime()}`,
    date, slot, mealId, action,
    engineVersion: NUTRITION_ENGINE_VERSION,
    createdAt: now.toISOString()
  };
}
