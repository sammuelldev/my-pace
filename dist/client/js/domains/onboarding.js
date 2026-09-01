import { normalizeRace, normalizeState, normalizeWeight } from "../core/schema.js";

export const ONBOARDING_STEPS = [
  { id: "welcome", title: "Vamos conhecer o seu ritmo", eyebrow: "BEM-VINDO AO MY PACE" },
  { id: "basics", title: "Primeiro, quem é você?", eyebrow: "SEU PERFIL" },
  { id: "history", title: "Como está sua corrida hoje?", eyebrow: "HISTÓRICO DE CORRIDA" },
  { id: "availability", title: "Onde o treino cabe na sua vida?", eyebrow: "DISPONIBILIDADE REAL" },
  { id: "goals", title: "O que você quer construir?", eyebrow: "OBJETIVO PRINCIPAL" },
  { id: "race", title: "Existe uma prova no horizonte?", eyebrow: "PROVA OPCIONAL" },
  { id: "safety", title: "Vamos respeitar seus limites", eyebrow: "SAÚDE E SEGURANÇA" },
  { id: "nutrition", title: "Como é sua rotina alimentar?", eyebrow: "ALIMENTAÇÃO" },
  { id: "finish", title: "Seu ponto de partida está pronto", eyebrow: "PERFIL INICIAL CRIADO" }
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const text = (value, max = 300) => String(value ?? "").trim().slice(0, max);
const list = value => [...new Set(String(value || "").split(",").map(item => text(item, 80)).filter(Boolean))].slice(0, 30);
const isoDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function paceToSeconds(value) {
  const parts = String(value || "").trim().split(":").map(Number);
  if (parts.length !== 2 || parts.some(part => !Number.isFinite(part)) || parts[1] > 59) return null;
  const seconds = parts[0] * 60 + parts[1];
  return seconds >= 120 && seconds <= 1200 ? seconds : null;
}

export function onboardingStep(state) {
  return clamp(Number(state?.onboarding?.currentStep) || 0, 0, ONBOARDING_STEPS.length - 1);
}

export function onboardingInitialValues(state, account = {}) {
  const declared = state.trainingProfile?.declared || {};
  const nutrition = state.nutritionProfile || {};
  const weight = [...(state.weights || [])].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.weight || "";
  const race = (state.races || []).find(item => item.status === "planned");
  return {
    name: state.profile?.name === "Atleta" ? (account.displayName || "") : state.profile?.name || "",
    birthDate: state.profile?.birthDate || "", gender: state.profile?.gender || "", city: state.profile?.city || "",
    heightCm: state.profile?.heightCm || "", currentWeight: weight,
    experience: declared.experience || "beginner", runningMonths: declared.runningMonths || 0,
    currentWeeklyKm: declared.currentWeeklyKm || "", longestRunKm: declared.longestRunKm || "",
    typicalPace: declared.typicalPaceSeconds ? `${Math.floor(declared.typicalPaceSeconds / 60)}:${String(declared.typicalPaceSeconds % 60).padStart(2, "0")}` : "",
    trainingDays: declared.trainingDays || [1, 3, 6], preferredTime: declared.preferredTime || "morning",
    sessionMinutes: declared.sessionMinutes || 45,
    primaryGoal: state.goals?.primary || "consistency", targetWeeklyKm: state.goals?.targetWeeklyKm || 10,
    motivation: state.goals?.motivation || "",
    hasRace: Boolean(race), raceName: race?.name || "", raceDate: race?.date || "", raceDistance: race?.distance || 5,
    raceLocation: race?.location || "", recentInjuries: declared.recentInjuries || "", healthNotes: declared.healthNotes || "",
    safetyConfirmed: Boolean(declared.safetyConfirmed),
    pattern: nutrition.pattern || "omnivore", mealsPerDay: nutrition.mealsPerDay || 4,
    restrictions: (nutrition.restrictions || []).join(", "), allergies: (nutrition.allergies || []).join(", "),
    dislikes: (nutrition.dislikes || []).join(", "), favorites: (nutrition.favorites || []).join(", "),
    cookingTime: nutrition.cookingTime || "medium", budget: nutrition.budget || "medium", goal: nutrition.goal || "performance"
  };
}

export function applyOnboardingStep(inputState, stepId, values, now = new Date()) {
  const state = normalizeState(inputState, now);
  state.onboarding.startedAt ||= now.toISOString();

  if (stepId === "basics") {
    state.profile = {
      ...state.profile,
      name: text(values.name, 40) || "Atleta",
      birthDate: text(values.birthDate, 10), gender: text(values.gender, 30), city: text(values.city, 80),
      heightCm: Number(values.heightCm) >= 100 && Number(values.heightCm) <= 250 ? Number(values.heightCm) : null
    };
    if (Number(values.currentWeight) >= 30 && Number(values.currentWeight) <= 250 && !state.weights.length) {
      state.weights.push(normalizeWeight({ id: `onboarding-weight-${isoDate(now)}`, date: isoDate(now), weight: Number(values.currentWeight), updatedAt: now.toISOString() }));
    }
  }

  if (stepId === "history") {
    state.trainingProfile.declared = {
      ...state.trainingProfile.declared,
      experience: ["beginner", "returning", "recreational", "experienced"].includes(values.experience) ? values.experience : "beginner",
      runningMonths: clamp(Number(values.runningMonths) || 0, 0, 720),
      currentWeeklyKm: clamp(Number(values.currentWeeklyKm) || 0, 0, 300),
      longestRunKm: clamp(Number(values.longestRunKm) || 0, 0, 300),
      typicalPaceSeconds: paceToSeconds(values.typicalPace)
    };
  }

  if (stepId === "availability") {
    const days = Array.isArray(values.trainingDays) ? values.trainingDays.map(Number) : [values.trainingDays].map(Number);
    state.trainingProfile.declared = {
      ...state.trainingProfile.declared,
      trainingDays: [...new Set(days.filter(day => day >= 0 && day <= 6))].slice(0, 7),
      preferredTime: ["morning", "afternoon", "evening", "variable"].includes(values.preferredTime) ? values.preferredTime : "variable",
      sessionMinutes: clamp(Number(values.sessionMinutes) || 45, 15, 240)
    };
  }

  if (stepId === "goals") {
    state.goals = {
      ...state.goals,
      primary: text(values.primaryGoal, 40) || "consistency",
      targetWeeklyKm: clamp(Number(values.targetWeeklyKm) || 10, 3, 300),
      motivation: text(values.motivation, 300)
    };
    state.settings.primaryGoal = state.goals.primary;
    state.settings.weeklyGoal = state.goals.targetWeeklyKm;
    state.settings.adaptiveGoal = true;
  }

  if (stepId === "race") {
    state.races = state.races.filter(item => item.id !== "onboarding-race");
    if (values.hasRace && values.raceName && values.raceDate) {
      state.races.push(normalizeRace({
        id: "onboarding-race", name: values.raceName, date: values.raceDate,
        distance: Number(values.raceDistance) || 5, location: values.raceLocation,
        createdAt: isoDate(now), status: "planned", updatedAt: now.toISOString()
      }));
    }
  }

  if (stepId === "safety") {
    state.trainingProfile.declared = {
      ...state.trainingProfile.declared,
      recentInjuries: text(values.recentInjuries, 500), healthNotes: text(values.healthNotes, 500),
      safetyConfirmed: Boolean(values.safetyConfirmed)
    };
  }

  if (stepId === "nutrition") {
    state.nutritionProfile = {
      pattern: text(values.pattern, 40) || "omnivore", mealsPerDay: clamp(Number(values.mealsPerDay) || 4, 2, 8),
      restrictions: list(values.restrictions), allergies: list(values.allergies), dislikes: list(values.dislikes), favorites: list(values.favorites),
      cookingTime: text(values.cookingTime, 30) || "medium", budget: text(values.budget, 30) || "medium",
      goal: text(values.goal, 40) || "performance"
    };
  }

  if (!state.onboarding.completedSteps.includes(stepId)) state.onboarding.completedSteps.push(stepId);
  const currentIndex = ONBOARDING_STEPS.findIndex(step => step.id === stepId);
  state.onboarding.currentStep = clamp(currentIndex + 1, 0, ONBOARDING_STEPS.length - 1);
  state.settings.onboarded = false;
  return normalizeState(state, now);
}

export function completeOnboarding(inputState, now = new Date()) {
  const state = normalizeState(inputState, now);
  state.onboarding.completed = true;
  state.onboarding.currentStep = ONBOARDING_STEPS.length - 1;
  state.onboarding.completedAt = now.toISOString();
  if (!state.onboarding.completedSteps.includes("finish")) state.onboarding.completedSteps.push("finish");
  state.settings.onboarded = true;
  return normalizeState(state, now);
}
