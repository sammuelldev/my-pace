import { NUTRITION_LIBRARY, NUTRITION_LIBRARY_VERSION } from "../data/nutrition-library.js";

export const NUTRITION_ENGINE_VERSION = 2;
export const TRAINING_DEMAND = Object.freeze({
  REST: "REST", VERY_LIGHT: "VERY_LIGHT", LIGHT: "LIGHT", MODERATE: "MODERATE",
  HARD: "HARD", VERY_HARD: "VERY_HARD", LONG_ENDURANCE: "LONG_ENDURANCE",
  RACE: "RACE", RECOVERY_PRIORITY: "RECOVERY_PRIORITY"
});

const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const localISO = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDate = value => new Date(`${value}T12:00:00`);
const daysBetween = (from, to) => Math.round((parseDate(to) - parseDate(from)) / 86400000);

const DEMAND_LABELS = {
  REST: "Dia de descanso", VERY_LIGHT: "Treino muito leve", LIGHT: "Treino leve",
  MODERATE: "Treino moderado", HARD: "Treino exigente", VERY_HARD: "Treino muito exigente",
  LONG_ENDURANCE: "Treino longo", RACE: "Dia de prova", RECOVERY_PRIORITY: "Recuperação prioritária"
};

const ALLERGEN_RULES = [
  ["milk", /leite|lactose|laticinio|caseina|queijo|iogurte|ricota|manteiga/], ["gluten", /gluten|trigo|centeio|cevada/],
  ["egg", /ovo|albumina/], ["soy", /soja/], ["peanut", /amendoim/],
  ["tree-nut", /castanha|noz|amendoa|avela|pistache/], ["sesame", /gergelim|tahine/],
  ["fish", /peixe|atum|sardinha|salmao|tilapia/], ["shellfish", /camarao|crustaceo|marisco/]
];

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function rpeValue(session) {
  const values = String(session?.rpe || "").match(/\d+(?:[.,]\d+)?/g)?.map(value => Number(value.replace(",", "."))) || [];
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 3;
}

function sessionDurationMinutes(state, session) {
  if (Number(session?.durationMinutes) > 0) return Number(session.durationMinutes);
  if (Number(session?.durationSeconds) > 0) return Number(session.durationSeconds) / 60;
  const pace = Number(state.trainingProfile?.declared?.typicalPaceSeconds) || 390;
  return Number(session?.distance) > 0 ? Number(session.distance) * pace / 60 : Number(state.trainingProfile?.declared?.sessionMinutes) || 45;
}

function recentLoadRatio(state, date) {
  const reference = Math.max(3, Number(state.trainingProfile?.declared?.currentWeeklyKm) || Number(state.goals?.targetWeeklyKm) || 10);
  const recent = (state.workouts || []).filter(item => { const gap = daysBetween(item.date, date); return gap >= 0 && gap <= 7; })
    .reduce((sum, item) => sum + Number(item.distance || 0), 0);
  return recent / reference;
}

function hasRecentRace(state, date) {
  return (state.races || []).some(item => item.status === "completed" && item.result && daysBetween(item.date, date) >= 0 && daysBetween(item.date, date) <= 2);
}

export function classifyTrainingDemand(state, session = null, date = localISO()) {
  if (hasRecentRace(state, date) && !session?.race) return TRAINING_DEMAND.RECOVERY_PRIORITY;
  if (!session || session.category === "rest") return TRAINING_DEMAND.REST;
  if (session.race || session.category === "race") return TRAINING_DEMAND.RACE;
  if (/recupera/.test(normalize(`${session.type} ${session.category}`))) return TRAINING_DEMAND.RECOVERY_PRIORITY;
  const experience = state.trainingProfile?.declared?.experience || "beginner";
  const experienceAdjustment = experience === "beginner" ? 0.7 : experience === "returning" ? 0.4 : experience === "experienced" ? -0.3 : 0;
  const relativeRpe = rpeValue(session) + experienceAdjustment + (recentLoadRatio(state, date) > 1.15 ? 0.5 : 0);
  const duration = sessionDurationMinutes(state, session);
  if (session.category === "endurance" && duration >= 65) return TRAINING_DEMAND.LONG_ENDURANCE;
  if (relativeRpe >= 7.5 || duration >= 85 || (["quality", "test"].includes(session.category) && duration >= 65)) return TRAINING_DEMAND.VERY_HARD;
  if (relativeRpe >= 6.2 || duration >= 60 || ["quality", "test", "endurance"].includes(session.category)) return TRAINING_DEMAND.HARD;
  if (relativeRpe >= 4.8 || duration >= 45) return TRAINING_DEMAND.MODERATE;
  if (relativeRpe <= 3.2 && duration <= 30) return TRAINING_DEMAND.VERY_LIGHT;
  return TRAINING_DEMAND.LIGHT;
}

function trainingTime(state) {
  const value = state.trainingProfile?.declared?.preferredTime || "morning";
  return ["morning", "afternoon", "evening", "variable"].includes(value) ? value : "variable";
}

function isStrengthSession(session) {
  return /forca|musculacao|strength/.test(normalize(`${session?.type} ${session?.category}`));
}

export function nutritionSlotStructure(state, session = null) {
  if (!session || session.category === "rest") return [
    { id: "breakfast", label: "Café da manhã", context: "breakfast" },
    { id: "lunch", label: "Almoço", context: "lunch" },
    { id: "snack", label: "Lanche", context: "snack" },
    { id: "dinner", label: "Jantar", context: "dinner" }
  ];
  const time = trainingTime(state);
  if (isStrengthSession(session)) return [
    { id: "breakfast", label: "Café da manhã", context: "breakfast" },
    { id: "lunch", label: "Almoço", context: "lunch" },
    { id: "snack", label: "Lanche", context: "snack" },
    { id: "post_strength", label: "Refeição pós-força", context: "post_strength" },
    { id: "dinner", label: "Jantar", context: "dinner" }
  ];
  if (time === "morning") {
    const slots = [
      { id: "pre_run", label: "Antes da corrida", context: "pre_run" },
      { id: "post_run", label: "Lanche pós-corrida", context: "post_run" },
      { id: "lunch", label: "Almoço", context: "lunch" },
      { id: "snack", label: "Lanche da tarde", context: "snack" },
      { id: "dinner", label: "Jantar", context: "dinner" }
    ];
    if (Number(state.nutritionProfile?.mealsPerDay) >= 6) slots.push({ id: "supper", label: "Ceia", context: "supper" });
    return slots;
  }
  if (time === "evening") return [
    { id: "breakfast", label: "Café da manhã", context: "breakfast" },
    { id: "lunch", label: "Almoço", context: "lunch" },
    { id: "snack", label: "Lanche da tarde", context: "snack" },
    { id: "pre_run", label: "Antes da corrida", context: "pre_run" },
    { id: "post_run", label: "Jantar pós-corrida", context: "post_run" }
  ];
  return [
    { id: "breakfast", label: "Café da manhã", context: "breakfast" },
    { id: "lunch", label: "Almoço", context: "lunch" },
    { id: "pre_run", label: "Antes da corrida", context: "pre_run" },
    { id: "post_run", label: "Lanche pós-corrida", context: "post_run" },
    { id: "dinner", label: "Jantar", context: "dinner" }
  ];
}

function profileExclusions(profile) {
  const raw = [...(profile.allergies || []), ...(profile.restrictions || [])].map(normalize).filter(Boolean);
  const allergens = new Set();
  raw.forEach(value => ALLERGEN_RULES.forEach(([code, pattern]) => { if (pattern.test(value)) allergens.add(code); }));
  const tokens = raw.map(value => value.replace(/\b(sem|nao posso comer|alergia a|intolerancia a)\b/g, "").trim()).filter(value => value.length > 2);
  return { allergens, tokens };
}

const itemText = item => normalize(`${item.name} ${item.composition} ${(item.ingredients || []).join(" ")}`);

function isAllowed(item, state, date) {
  const profile = state.nutritionProfile || {};
  const pattern = profile.pattern || "omnivore";
  if (!["omnivore", "other"].includes(pattern) && !item.patterns.includes(pattern)) return false;
  const excluded = profileExclusions(profile);
  if (item.allergens.some(allergen => excluded.allergens.has(allergen))) return false;
  const text = itemText(item);
  const freeTokens = excluded.tokens.filter(token => !ALLERGEN_RULES.some(([, rule]) => rule.test(token)));
  if (freeTokens.some(token => text.includes(token))) return false;
  if ((profile.dislikes || []).map(normalize).filter(value => value.length > 2).some(value => text.includes(value))) return false;
  return !(state.nutritionHistory || []).some(entry => {
    if (entry.mealId !== item.id) return false;
    const gap = daysBetween(entry.date, date);
    if (gap < 0) return false;
    if (entry.action === "disliked") return true;
    if (entry.action !== "rejected") return false;
    return gap === 0 || ["dont-like", "cannot-eat", ""].includes(entry.reasonCode || "");
  });
}

function latestSelections(state, date) {
  const selections = new Map();
  [...(state.nutritionHistory || [])].filter(entry => entry.date === date && entry.action === "selected")
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .forEach(entry => selections.set(entry.slot, entry.mealId));
  return selections;
}

function selectedForSlot(selections, slot) {
  return selections.get(slot.id) || (slot.id === "pre_run" ? selections.get("before") : null) || (slot.id === "post_run" ? selections.get("after") : null) || null;
}

function daysSinceLastSelection(item, state, date) {
  const gaps = (state.nutritionHistory || []).filter(entry => entry.mealId === item.id && entry.action === "selected")
    .map(entry => daysBetween(entry.date, date)).filter(gap => gap > 0);
  return gaps.length ? Math.min(...gaps) : null;
}

function personalizationSeed(state) {
  const profile = state.nutritionProfile || {};
  const declared = state.trainingProfile?.declared || {};
  return JSON.stringify([profile.pattern, profile.goal, profile.cookingTime, profile.budget, profile.favorites,
    profile.restrictions, declared.experience, declared.preferredTime, state.goals?.primary]);
}

function scoreItem(item, state, slot, demand, date) {
  let score = 0;
  const reasonCodes = [`slot-${slot.context}`, `demand-${demand.toLowerCase()}`];
  const tags = new Set(item.tags || []);
  const hard = [TRAINING_DEMAND.HARD, TRAINING_DEMAND.VERY_HARD, TRAINING_DEMAND.LONG_ENDURANCE, TRAINING_DEMAND.RACE].includes(demand);
  const recovery = hard || demand === TRAINING_DEMAND.RECOVERY_PRIORITY;
  if (slot.context === "pre_run") {
    if (tags.has("carb-rich")) { score += hard ? 15 : 10; reasonCodes.push("pre-run-carbohydrate"); }
    if (tags.has("easy-digest")) { score += 12; reasonCodes.push("easy-digestion"); }
  } else if (["post_run", "post_strength"].includes(slot.context)) {
    if (tags.has("recovery")) { score += 13; reasonCodes.push("recovery-combination"); }
    if (tags.has("protein-rich") || tags.has("plant-protein")) score += recovery ? 10 : 7;
    if (tags.has("carb-rich")) score += recovery ? 8 : 4;
  } else {
    if (tags.has("balanced")) score += 6;
    if (hard && tags.has("carb-rich")) score += 5;
    if (recovery && (tags.has("protein-rich") || tags.has("plant-protein"))) score += 5;
  }
  const profile = state.nutritionProfile || {};
  if (profile.goal === "performance" && (tags.has("carb-rich") || tags.has("recovery"))) { score += 4; reasonCodes.push("goal-performance"); }
  if (profile.goal === "body-composition" && (tags.has("balanced") || tags.has("protein-rich") || tags.has("plant-protein"))) { score += 4; reasonCodes.push("goal-body-composition"); }
  if (profile.goal === "health" && (tags.has("whole-food") || tags.has("plant-protein"))) { score += 4; reasonCodes.push("goal-health"); }
  if (profile.goal === "practicality" && item.prep === "low") { score += 7; reasonCodes.push("goal-practicality"); }
  if (profile.cookingTime === "low") score += item.prep === "low" ? 7 : item.prep === "high" ? -14 : -5;
  else if (profile.cookingTime === "medium") score += item.prep === "low" ? 2 : item.prep === "high" ? -5 : 3;
  else if (item.prep === "high") score += 3;
  if (profile.budget === "low") score += item.budget === "low" ? 6 : item.budget === "high" ? -16 : -4;
  else if (profile.budget === "medium" && item.budget === "high") score -= 5;
  const text = itemText(item);
  const favoriteMatches = (profile.favorites || []).map(normalize).filter(value => value.length > 2 && text.includes(value)).length;
  if (favoriteMatches) { score += Math.min(9, favoriteMatches * 4); reasonCodes.push("declared-favorite"); }
  const liked = (state.nutritionHistory || []).filter(entry => entry.mealId === item.id && entry.action === "liked").length;
  if (liked) { score += Math.min(12, liked * 5); reasonCodes.push("positive-feedback"); }
  const contextualRejections = (state.nutritionHistory || []).filter(entry => entry.mealId === item.id && entry.action === "rejected"
    && ["missing-ingredients", "takes-too-long", "want-another"].includes(entry.reasonCode)
    && daysBetween(entry.date, date) >= 0 && daysBetween(entry.date, date) <= 30);
  contextualRejections.forEach(entry => { score -= entry.reasonCode === "want-another" ? 10 : 22; });
  if (contextualRejections.length) reasonCodes.push("contextual-rejection-penalty");
  const daysSince = daysSinceLastSelection(item, state, date);
  if (daysSince === 1) score -= 120;
  else if (daysSince !== null && daysSince <= 3) score -= 55;
  else if (daysSince !== null && daysSince <= 7) score -= 26;
  else if (daysSince !== null && daysSince <= 14) score -= 11;
  else if (daysSince !== null && daysSince <= 30) score -= 3;
  if (daysSince !== null) reasonCodes.push("recent-variety-penalty");
  score += (stableHash(`${personalizationSeed(state)}|${date}|${slot.id}|${item.id}`) % 700) / 100;
  return { score, reasonCodes: [...new Set(reasonCodes)] };
}

function contextualPoint(slot, demand, item) {
  if (slot.context === "pre_run") return item.tags.includes("easy-digest") ? "Carboidrato simples para uma janela pré-corrida que você já conhece." : "Energia antes do treino sem transformar a refeição em um teste.";
  if (["post_run", "post_strength"].includes(slot.context)) return "Combina carboidrato e proteína para organizar a recuperação após o esforço.";
  if (slot.context === "lunch") return "Almoço completo que sustenta o restante do dia e mantém variedade no prato.";
  if (slot.context === "dinner") return "Jantar completo, com preparo e densidade ajustados à demanda de hoje.";
  if (slot.context === "breakfast") return "Primeira refeição estruturada para começar o dia com energia consistente.";
  if (slot.context === "supper") return "Opção leve e opcional para quando a ceia faz parte da sua rotina.";
  return demand === TRAINING_DEMAND.REST ? "Lanche simples para manter regularidade sem criar obrigação alimentar." : "Lanche prático que distribui melhor a energia do dia.";
}

function badgeFor(item, slot, demand) {
  if (["post_run", "post_strength"].includes(slot.context)) return "Recuperação";
  if (slot.context === "pre_run" && [TRAINING_DEMAND.HARD, TRAINING_DEMAND.VERY_HARD, TRAINING_DEMAND.LONG_ENDURANCE, TRAINING_DEMAND.RACE].includes(demand)) return "Energia antes";
  if (item.prep === "low") return `Até ${item.minutes} min`;
  if (item.budget === "low") return "Econômico";
  return item.tags.includes("plant-protein") ? "Proteína vegetal" : null;
}

function explainSelection(item, slot, demand, scoring, state) {
  const pieces = [];
  if (scoring.reasonCodes.includes("declared-favorite")) pieces.push("inclui alimentos que você disse gostar");
  if (scoring.reasonCodes.includes("positive-feedback")) pieces.push("já recebeu seu feedback positivo");
  if (scoring.reasonCodes.includes("goal-practicality")) pieces.push("cabe no tempo de preparo informado");
  if (slot.context === "pre_run") pieces.push("é compatível com o momento antes da corrida");
  else if (["post_run", "post_strength"].includes(slot.context)) pieces.push("apoia a organização da recuperação");
  else pieces.push(`combina com ${DEMAND_LABELS[demand].toLowerCase()}`);
  if (state.nutritionProfile?.budget === "low" && item.budget === "low") pieces.push("respeita a faixa econômica");
  return `Esta opção ${pieces.slice(0, 2).join(" e ")}. A escolha também respeita suas restrições e evita repetições recentes.`;
}

function rankedOptions(state, slot, demand, date, excludedIds) {
  return NUTRITION_LIBRARY.filter(item => item.slotTypes.includes(slot.context) && !excludedIds.has(item.id) && isAllowed(item, state, date))
    .map(item => {
      const scoring = scoreItem(item, state, slot, demand, date);
      return { ...item, score: Math.round(scoring.score * 100) / 100, reasonCodes: scoring.reasonCodes,
        reason: explainSelection(item, slot, demand, scoring, state), point: contextualPoint(slot, demand, item), badge: badgeFor(item, slot, demand) };
    }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR"));
}

function sessionContext(state, session, demand) {
  const timeLabel = { morning: "pela manhã", afternoon: "à tarde", evening: "à noite", variable: "em horário variável" }[trainingTime(state)];
  if (demand === TRAINING_DEMAND.REST) return { focus: "Regularidade, variedade e refeições completas ao longo do dia", timeLabel: "sem treino programado" };
  if (demand === TRAINING_DEMAND.RACE) return { focus: "Use somente alimentos e horários já testados antes da largada", timeLabel };
  if (demand === TRAINING_DEMAND.RECOVERY_PRIORITY) return { focus: "Priorize refeições familiares, hidratação e recuperação sem compensações", timeLabel };
  if (isStrengthSession(session)) return { focus: "Distribua energia ao longo do dia e inclua uma refeição pós-força", timeLabel };
  if ([TRAINING_DEMAND.HARD, TRAINING_DEMAND.VERY_HARD, TRAINING_DEMAND.LONG_ENDURANCE].includes(demand)) return { focus: "Chegue com energia e organize a recuperação depois do treino", timeLabel };
  return { focus: "Mantenha refeições confortáveis e consistentes em torno da corrida", timeLabel };
}

export function nutritionRecommendations(state, session = null, date = localISO()) {
  const demand = classifyTrainingDemand(state, session, date);
  const context = sessionContext(state, session, demand);
  const definitions = nutritionSlotStructure(state, session);
  const selections = latestSelections(state, date);
  const reserved = new Set(definitions.map(slot => selectedForSlot(selections, slot)).filter(Boolean));
  const usedIds = new Set();
  const slots = definitions.map(slot => {
    const selectedId = selectedForSlot(selections, slot);
    const excluded = new Set([...usedIds, ...[...reserved].filter(id => id !== selectedId)]);
    const ranked = rankedOptions(state, slot, demand, date, excluded);
    const selected = (selectedId ? ranked.find(item => item.id === selectedId) : null) || ranked[0] || null;
    if (selected) usedIds.add(selected.id);
    return { ...slot, selected, options: selected ? [selected, ...ranked.filter(item => item.id !== selected.id)].slice(0, 6) : [] };
  });
  return {
    engineVersion: NUTRITION_ENGINE_VERSION, libraryVersion: NUTRITION_LIBRARY_VERSION, librarySize: NUTRITION_LIBRARY.length,
    date, demand, level: DEMAND_LABELS[demand], focus: context.focus, timeContext: context.timeLabel, slots,
    hydration: session ? "Distribua água ao longo do dia e ajuste pelas condições, duração e sua sede." : "Mantenha água disponível e use sua sede como referência cotidiana.",
    sourceIds: ["acsm-nutrition-performance-2016"],
    reasonCodes: [`demand-${demand.toLowerCase()}`, `training-time-${trainingTime(state)}`, "profile-aware", "same-day-unique"],
    safetyNote: "Sugestões organizacionais gerais; alergias, condições clínicas e necessidades individuais devem ser avaliadas por nutricionista."
  };
}

export function createNutritionFeedback({ date, slot, mealId, action, reasonCode = "", blockedIngredient = "" }, now = new Date()) {
  const safeAction = ["liked", "disliked", "rejected", "selected"].includes(action) ? action : "selected";
  return {
    id: `nutrition-${date}-${slot}-${safeAction}-${now.getTime()}`,
    date, slot: String(slot || "").slice(0, 40), mealId: String(mealId || "").slice(0, 120), action: safeAction,
    reasonCode: String(reasonCode || "").slice(0, 80), blockedIngredient: String(blockedIngredient || "").trim().slice(0, 80),
    engineVersion: NUTRITION_ENGINE_VERSION, createdAt: now.toISOString()
  };
}
