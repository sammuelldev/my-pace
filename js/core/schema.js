export const SCHEMA_VERSION = 4;
export const STORAGE_KEY = "pace-dashboard-portable-v1";
export const LEGACY_BACKUP_KEY = "mypace-legacy-v3-backup";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const todayISO = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const cleanString = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const cleanStringList = (value, maxItems = 30, maxLength = 80) => Array.isArray(value)
  ? [...new Set(value.map(item => cleanString(item, maxLength)).filter(Boolean))].slice(0, maxItems)
  : [];
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
const stableId = (prefix, item) => {
  const source = JSON.stringify(item || {});
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return `${prefix}-${(hash >>> 0).toString(36)}`;
};
const stableTimestamp = item => cleanString(item?.updatedAt, 40)
  || `${validDate(item?.date) ? item.date : "1970-01-01"}T12:00:00.000Z`;

export function createDefaultState(now = new Date()) {
  const createdAt = now.toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    version: SCHEMA_VERSION,
    profile: { name: "Atleta", photo: null, birthDate: "", gender: "", city: "", heightCm: null },
    goals: { primary: "consistency", targetDistanceKm: null, targetWeeklyKm: 10, motivation: "" },
    trainingProfile: { declared: {
      experience: "beginner", runningMonths: 0, currentWeeklyKm: 0, longestRunKm: 0,
      typicalPaceSeconds: null, trainingDays: [1, 3, 6], preferredTime: "morning",
      sessionMinutes: 45, recentInjuries: "", healthNotes: "", safetyConfirmed: false
    } },
    nutritionProfile: {
      pattern: "omnivore", mealsPerDay: 4, restrictions: [], allergies: [], dislikes: [], favorites: [],
      cookingTime: "medium", budget: "medium", goal: "performance"
    },
    onboarding: { completed: false, currentStep: 0, completedSteps: [], startedAt: null, completedAt: null },
    workouts: [], weights: [], equipment: [], races: [], readiness: {}, raceChecklist: {},
    nutritionHistory: [], recommendationFeedback: [], achievements: [], journal: [],
    settings: {
      adaptiveGoal: true, weeklyGoal: 10, theme: "system", accent: "blue",
      primaryGoal: "consistency", onboarded: false, reducedData: false
    },
    meta: {
      createdAt, updatedAt: createdAt, lastLocalChangeAt: createdAt,
      migratedFrom: null, legacyBackupCreated: false
    }
  };
}

export function normalizeReadiness(item) {
  return {
    sleep: clamp(Number(item?.sleep) || 3, 1, 5),
    energy: clamp(Number(item?.energy) || 3, 1, 5),
    soreness: clamp(Number(item?.soreness) || 1, 1, 5),
    notes: cleanString(item?.notes, 240),
    updatedAt: stableTimestamp(item)
  };
}

export function normalizeWorkout(item) {
  return {
    id: cleanString(item?.id, 100) || stableId("workout", item),
    date: validDate(item?.date) ? item.date : todayISO(),
    distance: Math.max(0, Number(item?.distance) || 0),
    durationSeconds: Math.max(0, Number(item?.durationSeconds) || 0),
    rpe: cleanString(item?.rpe || "4", 4), type: cleanString(item?.type || "Corrida", 40),
    feeling: cleanString(item?.feeling || "Normal", 30), stitch: cleanString(item?.stitch || "Nenhuma", 30),
    shoe: cleanString(item?.shoe, 100), notes: cleanString(item?.notes, 500),
    status: ["completed", "planned", "missed", "skipped"].includes(item?.status) ? item.status : "completed",
    source: cleanString(item?.source || "manual", 30),
    updatedAt: stableTimestamp(item)
  };
}

export function normalizeWeight(item) {
  return {
    id: cleanString(item?.id, 100) || stableId("metric", item), date: validDate(item?.date) ? item.date : todayISO(),
    weight: clamp(Number(item?.weight) || 0, 30, 250), type: "weight",
    updatedAt: stableTimestamp(item)
  };
}

export function normalizeEquipment(item) {
  return {
    id: cleanString(item?.id, 100) || stableId("equipment", item), name: cleanString(item?.name, 80),
    type: cleanString(item?.type || "Treino", 30), lifespan: clamp(Number(item?.lifespan) || 600, 100, 2000),
    totalKm: Math.max(0, Number(item?.totalKm) || 0), planned: Boolean(item?.planned), retired: Boolean(item?.retired),
    updatedAt: stableTimestamp(item)
  };
}

export function normalizeRace(item) {
  const result = item?.result && Number(item.result.officialSeconds) > 0 ? {
    officialSeconds: Number(item.result.officialSeconds), distance: Number(item.result.distance || item.distance),
    placement: item.result.placement ? Number(item.result.placement) : null, bib: cleanString(item.result.bib, 20),
    feeling: cleanString(item.result.feeling, 40), weather: cleanString(item.result.weather, 60),
    splits: Array.isArray(item.result.splits) ? item.result.splits.map(Number).filter(value => value > 0 && value < 3600).slice(0, 100) : [],
    shoe: cleanString(item.result.shoe, 100), notes: cleanString(item.result.notes, 800)
  } : null;
  return {
    id: cleanString(item?.id, 100) || stableId("race", item), name: cleanString(item?.name || "Prova", 80),
    date: validDate(item?.date) ? item.date : todayISO(), distance: Math.max(0.1, Number(item?.distance) || 5),
    location: cleanString(item?.location, 80), goalSeconds: Number(item?.goalSeconds) || null,
    createdAt: validDate(item?.createdAt) ? item.createdAt : todayISO(),
    status: result || item?.status === "completed" ? "completed" : "planned", result,
    updatedAt: stableTimestamp(item)
  };
}

function normalizeProfile(input, base) {
  const photo = typeof input?.photo === "string" && (/^data:image\//.test(input.photo) || /^https:\/\//.test(input.photo)) ? input.photo : null;
  return {
    name: cleanString(input?.name || base.name, 40) || base.name, photo,
    birthDate: validDate(input?.birthDate) ? input.birthDate : "", gender: cleanString(input?.gender, 30),
    city: cleanString(input?.city, 80),
    heightCm: Number(input?.heightCm) >= 100 && Number(input?.heightCm) <= 250 ? Number(input.heightCm) : null
  };
}

function normalizeTrainingProfile(input, base) {
  const declared = input?.declared || input || {};
  return { declared: {
    experience: ["beginner", "returning", "recreational", "experienced"].includes(declared.experience) ? declared.experience : base.declared.experience,
    runningMonths: clamp(Number(declared.runningMonths) || 0, 0, 720),
    currentWeeklyKm: clamp(Number(declared.currentWeeklyKm) || 0, 0, 300),
    longestRunKm: clamp(Number(declared.longestRunKm) || 0, 0, 300),
    typicalPaceSeconds: Number(declared.typicalPaceSeconds) > 120 && Number(declared.typicalPaceSeconds) < 1200 ? Number(declared.typicalPaceSeconds) : null,
    trainingDays: Array.isArray(declared.trainingDays) ? [...new Set(declared.trainingDays.map(Number).filter(day => day >= 0 && day <= 6))].slice(0, 7) : base.declared.trainingDays,
    preferredTime: ["morning", "afternoon", "evening", "variable"].includes(declared.preferredTime) ? declared.preferredTime : base.declared.preferredTime,
    sessionMinutes: clamp(Number(declared.sessionMinutes) || 45, 15, 240),
    recentInjuries: cleanString(declared.recentInjuries, 500), healthNotes: cleanString(declared.healthNotes, 500),
    safetyConfirmed: Boolean(declared.safetyConfirmed)
  } };
}

export function normalizeState(input, now = new Date()) {
  const base = createDefaultState(now);
  if (!input || typeof input !== "object") return base;
  const sourceVersion = Number(input.schemaVersion || input.version || 1);
  const legacyOnboarded = input.settings?.onboarded === undefined ? Boolean(input.workouts?.length) : Boolean(input.settings.onboarded);
  const onboarding = input.onboarding || {};
  const primaryGoal = ["consistency", "5k", "10k", "health", "performance", "race"].includes(input.goals?.primary || input.settings?.primaryGoal)
    ? (input.goals?.primary || input.settings.primaryGoal) : base.goals.primary;
  return {
    ...base, schemaVersion: SCHEMA_VERSION, version: SCHEMA_VERSION,
    profile: normalizeProfile(input.profile, base.profile),
    goals: {
      primary: primaryGoal,
      targetDistanceKm: Number(input.goals?.targetDistanceKm) > 0 ? Number(input.goals.targetDistanceKm) : null,
      targetWeeklyKm: clamp(Number(input.goals?.targetWeeklyKm || input.settings?.weeklyGoal) || 10, 3, 300),
      motivation: cleanString(input.goals?.motivation, 300)
    },
    trainingProfile: normalizeTrainingProfile(input.trainingProfile, base.trainingProfile),
    nutritionProfile: {
      pattern: cleanString(input.nutritionProfile?.pattern || base.nutritionProfile.pattern, 40),
      mealsPerDay: clamp(Number(input.nutritionProfile?.mealsPerDay) || 4, 2, 8),
      restrictions: cleanStringList(input.nutritionProfile?.restrictions), allergies: cleanStringList(input.nutritionProfile?.allergies),
      dislikes: cleanStringList(input.nutritionProfile?.dislikes), favorites: cleanStringList(input.nutritionProfile?.favorites),
      cookingTime: cleanString(input.nutritionProfile?.cookingTime || "medium", 30),
      budget: cleanString(input.nutritionProfile?.budget || "medium", 30),
      goal: cleanString(input.nutritionProfile?.goal || "performance", 40)
    },
    onboarding: {
      completed: onboarding.completed === undefined ? legacyOnboarded : Boolean(onboarding.completed),
      currentStep: clamp(Number(onboarding.currentStep) || 0, 0, 8),
      completedSteps: cleanStringList(onboarding.completedSteps, 10, 40),
      startedAt: cleanString(onboarding.startedAt, 40) || null,
      completedAt: cleanString(onboarding.completedAt, 40) || null
    },
    workouts: Array.isArray(input.workouts) ? input.workouts.filter(item => item && Number(item.distance) > 0 && Number(item.durationSeconds) > 0).map(normalizeWorkout) : [],
    weights: Array.isArray(input.weights) ? input.weights.filter(item => item && Number(item.weight) >= 30 && Number(item.weight) <= 250).map(normalizeWeight) : [],
    equipment: Array.isArray(input.equipment) ? input.equipment.filter(item => item && cleanString(item.name)).map(normalizeEquipment) : [],
    races: Array.isArray(input.races) ? input.races.filter(item => item && cleanString(item.name) && Number(item.distance) > 0).map(normalizeRace) : [],
    readiness: input.readiness && typeof input.readiness === "object" ? Object.fromEntries(Object.entries(input.readiness).slice(-90).map(([date, item]) => [String(date).slice(0, 10), normalizeReadiness({ ...item, date: String(date).slice(0, 10) })])) : {},
    raceChecklist: input.raceChecklist && typeof input.raceChecklist === "object" ? input.raceChecklist : {},
    nutritionHistory: Array.isArray(input.nutritionHistory) ? input.nutritionHistory.slice(-500) : [],
    recommendationFeedback: Array.isArray(input.recommendationFeedback) ? input.recommendationFeedback.slice(-500) : [],
    achievements: Array.isArray(input.achievements) ? input.achievements.slice(-200) : [],
    journal: Array.isArray(input.journal) ? input.journal.slice(-1000) : [],
    settings: {
      adaptiveGoal: input.settings?.adaptiveGoal !== false,
      weeklyGoal: clamp(Number(input.settings?.weeklyGoal) || 10, 3, 300),
      theme: ["system", "dark", "light"].includes(input.settings?.theme) ? input.settings.theme : "system",
      accent: ["blue", "violet", "green", "orange"].includes(input.settings?.accent) ? input.settings.accent : "blue",
      primaryGoal, onboarded: onboarding.completed === undefined ? legacyOnboarded : Boolean(onboarding.completed),
      reducedData: Boolean(input.settings?.reducedData)
    },
    meta: {
      createdAt: cleanString(input.meta?.createdAt, 40) || base.meta.createdAt,
      updatedAt: cleanString(input.meta?.updatedAt, 40) || base.meta.updatedAt,
      lastLocalChangeAt: cleanString(input.meta?.lastLocalChangeAt, 40) || base.meta.lastLocalChangeAt,
      migratedFrom: sourceVersion < SCHEMA_VERSION ? sourceVersion : (Number(input.meta?.migratedFrom) || null),
      legacyBackupCreated: Boolean(input.meta?.legacyBackupCreated)
    }
  };
}

export function hasMeaningfulData(state) {
  const value = normalizeState(state);
  return Boolean(value.workouts.length || value.races.length || value.weights.length || value.equipment.length ||
    value.journal.length || value.onboarding.completed || value.profile.name !== "Atleta" || value.profile.photo);
}

export function touchState(state, now = new Date()) {
  const normalized = normalizeState(state, now);
  const timestamp = now.toISOString();
  normalized.meta.updatedAt = timestamp;
  normalized.meta.lastLocalChangeAt = timestamp;
  return normalized;
}
