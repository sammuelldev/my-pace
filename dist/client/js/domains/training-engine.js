import { workoutById } from "../data/workout-library.js";
import { buildAthleteModel, explainTrainingRecommendation, readinessScore } from "./pace-engine.js";

export const TRAINING_ENGINE_VERSION = 1;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 1) => {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
};
const localISO = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDate = value => new Date(`${value}T12:00:00`);
const addDays = (date, days) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
const daysBetween = (a, b) => Math.ceil((parseDate(b) - parseDate(a)) / 86400000);

function paceShort(seconds) {
  const total = Math.max(120, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function paceRange(seconds, spread = 12) {
  return `${paceShort(seconds - spread)}–${paceShort(seconds + spread)} /km`;
}

function activeRace(state) {
  return (state.races || []).filter(race => race.status === "planned").sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

function latestFeedbackByDate(state) {
  const map = new Map();
  [...(state.recommendationFeedback || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).forEach(item => {
    if (item.sessionDate) map.set(item.sessionDate, item);
  });
  return map;
}

function selectWorkoutId({ day, days, week, model, race, daysToRace, missedRecently, testEligible }) {
  if (daysToRace === 0) return "race";
  if (daysToRace > 0 && daysToRace <= 2) return "recovery-run";
  if (missedRecently || model.confidence.level === "low") return day === days.at(-1) ? "long-run" : "easy-run";
  const weekendDay = days.find(value => value === 0 || value === 6);
  const longDay = weekendDay ?? days.at(-1);
  if (day === longDay && days.length >= 2) return "long-run";
  const qualityDay = days.find(value => value !== longDay) ?? days[0];
  if (day === qualityDay && testEligible && week % 4 === 3 && (!race || daysToRace > 21)) return "performance-test";
  if (day === qualityDay && model.declared.experience !== "beginner" && week % 2 === 1) return week % 4 === 1 ? "tempo-run" : "interval-run";
  return "easy-run";
}

function sessionDistance(workout, model, week, race, daysToRace) {
  if (workout.id === "race") return race.distance;
  if (workout.category === "rest") return 0;
  const gradualFactor = 1 + Math.min(week * 0.04, 0.2);
  let distance = model.capabilities.baseDistanceKm * workout.distanceFactor * gradualFactor;
  if (workout.category === "endurance") {
    const ceiling = race ? Math.max(model.capabilities.longestRunKm, race.distance * 0.9) : model.capabilities.longestRunKm * 1.25;
    distance = Math.min(distance, ceiling);
  }
  if (daysToRace > 0 && daysToRace <= 7) distance *= 0.7;
  const durationCap = model.declared.sessionMinutes * 60 / Math.max(240, model.capabilities.typicalPaceSeconds);
  return round(clamp(distance, workout.category === "recovery" ? 1.5 : 2, Math.max(2, durationCap)));
}

function sessionPace(workout, model, race) {
  const base = model.capabilities.typicalPaceSeconds;
  if (workout.id === "race") return race.goalSeconds ? paceRange(race.goalSeconds / race.distance, 6) : "Por esforço de prova";
  if (workout.category === "rest") return "Sem corrida";
  const offsets = { recovery: 75, easy: 48, endurance: 58, quality: workout.id === "interval-run" ? -15 : 5, test: -12, rest: 90 };
  return paceRange(base + (offsets[workout.category] ?? 45));
}

function raceWorkout() {
  return {
    id: "race", name: "Prova", category: "race", rpe: [7, 9], distanceFactor: 1,
    objective: "Executar a prova com início controlado",
    instructions: "Comece com domínio do esforço, estabilize no trecho central e progrida apenas se ainda houver reserva.",
    substitutions: []
  };
}

function canScheduleTest(state, model, now) {
  if (model.observed.sampleSize < 6 || model.confidence.level === "low") return false;
  const recentTest = (state.workouts || []).some(item => /teste/i.test(item.type) && daysBetween(item.date, localISO(now)) <= 56);
  return !recentTest;
}

export function createAdaptiveTrainingPlan(state, now = new Date()) {
  const model = buildAthleteModel(state, now);
  const race = activeRace(state);
  const today = parseDate(localISO(now));
  const maxHorizon = addDays(today, 48);
  const raceDate = race ? parseDate(race.date) : null;
  const end = raceDate && raceDate <= maxHorizon ? raceDate : maxHorizon;
  const declaredDays = [...new Set((model.declared.trainingDays || []).map(Number).filter(day => day >= 0 && day <= 6))];
  const trainingDays = declaredDays.length ? declaredDays : [1, 3, 6];
  const feedback = latestFeedbackByDate(state);
  const recentMissedDates = new Set((state.recommendationFeedback || []).filter(item => item.action === "missed").map(item => item.sessionDate));
  const testEligible = canScheduleTest(state, model, now);
  const sessions = [];
  let cursor = new Date(today);

  while (cursor <= end && sessions.length < 28) {
    const date = localISO(cursor);
    if (race && date === race.date) {
      const session = {
        id: `${date}-race`, recommendationId: `${date}-race`, workoutId: "race", date,
        type: "Prova", category: "race", distance: race.distance, rpe: "7–9",
        pace: sessionPace(raceWorkout(), model, race), objective: `Executar ${race.name}`,
        details: raceWorkout().instructions, race: true, engineVersion: TRAINING_ENGINE_VERSION
      };
      sessions.push(explainTrainingRecommendation(session, state, model));
      break;
    }
    if (trainingDays.includes(cursor.getDay())) {
      const week = Math.max(0, Math.floor((cursor - today) / 604800000));
      const daysToRace = race ? daysBetween(date, race.date) : 999;
      const missedRecently = [...recentMissedDates].some(missedDate => {
        const gap = daysBetween(missedDate, date);
        return gap > 0 && gap <= 7;
      });
      let workoutId = selectWorkoutId({ day: cursor.getDay(), days: trainingDays, week, model, race, daysToRace, missedRecently, testEligible });
      const decision = feedback.get(date);
      if (decision?.action === "missed") { cursor = addDays(cursor, 1); continue; }
      if (decision?.action === "substituted" && decision.replacementWorkoutId) workoutId = decision.replacementWorkoutId;
      let workout = workoutId === "race" ? raceWorkout() : workoutById(workoutId);
      const score = readinessScore(state.readiness?.[date]);
      if (score !== null && score < 45 && workout.category !== "race") workout = workoutById("recovery-run");
      else if (score !== null && score < 70 && ["quality", "test"].includes(workout.category)) workout = workoutById("easy-run");
      const distance = sessionDistance(workout, model, week, race, daysToRace);
      const session = {
        id: `${date}-${workout.id}`, recommendationId: `${date}-${workout.id}`, workoutId: workout.id,
        date, type: workout.name, category: workout.category, distance,
        rpe: `${workout.rpe[0]}–${workout.rpe[1]}`, pace: sessionPace(workout, model, race),
        objective: workout.objective, details: workout.instructions,
        substitutionIds: workout.substitutions, substituted: decision?.action === "substituted",
        engineVersion: TRAINING_ENGINE_VERSION
      };
      const explained = explainTrainingRecommendation(session, state, model);
      if (missedRecently) {
        explained.recommendation.reasonCodes.push("no-missed-compensation");
        explained.recommendation.sourceRuleIds.push("training-no-missed-compensation");
        explained.recommendation.explanations.unshift("Você não precisa compensar o treino perdido; esta sessão retoma o plano com controle.");
      }
      sessions.push(explained);
    }
    cursor = addDays(cursor, 1);
  }
  return sessions;
}

export function workoutSubstitutions(session) {
  return (session?.substitutionIds || []).map(workoutById).map(workout => ({
    workoutId: workout.id, name: workout.name, category: workout.category,
    rpe: `${workout.rpe[0]}–${workout.rpe[1]}`, objective: workout.objective
  }));
}

export function createTrainingDecision(session, action, replacementWorkoutId = null, now = new Date()) {
  return {
    id: `decision-${session.date}-${now.getTime()}`,
    recommendationId: session.recommendationId,
    sessionDate: session.date,
    originalWorkoutId: session.workoutId,
    action,
    replacementWorkoutId: action === "substituted" ? replacementWorkoutId : null,
    reasonCode: action === "missed" ? "life-got-in-the-way" : "user-selected-substitution",
    createdAt: now.toISOString()
  };
}
