import { recommendationRuleById } from "../data/recommendation-rules.js";

export const PACE_ENGINE_VERSION = 1;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 1) => {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
};
const parseDate = value => new Date(`${value}T12:00:00`);
const localISO = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function paceSeconds(item) {
  const duration = Number(item.durationSeconds || item.result?.officialSeconds || 0);
  const distance = Number(item.distance || item.result?.distance || 0);
  return duration > 0 && distance > 0 ? duration / distance : null;
}

function completedRuns(state) {
  const workouts = (state.workouts || []).filter(item => item.status !== "missed" && item.status !== "skipped" && paceSeconds(item));
  const races = (state.races || []).filter(item => item.status === "completed" && item.result && paceSeconds(item)).map(item => ({
    id: item.id, date: item.date, distance: item.result.distance, durationSeconds: item.result.officialSeconds,
    rpe: "8", type: item.name, source: "race"
  }));
  return [...workouts, ...races].sort((a, b) => a.date.localeCompare(b.date));
}

function trendFromRuns(runs) {
  const sample = runs.slice(-6);
  if (sample.length < 4) return { direction: "insufficient", percent: 0 };
  const split = Math.floor(sample.length / 2);
  const earlier = average(sample.slice(0, split).map(paceSeconds).filter(Boolean));
  const recent = average(sample.slice(split).map(paceSeconds).filter(Boolean));
  if (!earlier || !recent) return { direction: "insufficient", percent: 0 };
  const percent = (earlier - recent) / earlier * 100;
  return { direction: Math.abs(percent) < 1 ? "stable" : percent > 0 ? "improving" : "slower", percent: round(percent) };
}

function confidenceFrom(state, runs, now) {
  const declared = state.trainingProfile?.declared || {};
  const declaredSignals = [declared.experience, declared.trainingDays?.length, declared.sessionMinutes, declared.currentWeeklyKm || declared.longestRunKm]
    .filter(Boolean).length;
  const recentCutoff = new Date(now);
  recentCutoff.setDate(recentCutoff.getDate() - 42);
  const recentRuns = runs.filter(item => parseDate(item.date) >= recentCutoff);
  const readinessCount = Object.keys(state.readiness || {}).length;
  const score = clamp(12 + declaredSignals * 5 + Math.min(recentRuns.length, 6) * 9 + Math.min(readinessCount, 5) * 2, 10, 92);
  const level = score >= 72 ? "high" : score >= 43 ? "moderate" : "low";
  const reasonCodes = [];
  if (recentRuns.length < 3) reasonCodes.push("few-observed-workouts");
  if (!declared.typicalPaceSeconds) reasonCodes.push("no-declared-pace");
  if (!readinessCount) reasonCodes.push("no-readiness-history");
  if (!reasonCodes.length) reasonCodes.push("consistent-observed-data");
  return { score, level, reasonCodes, observedSessions: recentRuns.length };
}

export function readinessScore(item) {
  if (!item) return null;
  return Math.round((Number(item.sleep) + Number(item.energy) + (6 - Number(item.soreness))) / 15 * 100);
}

export function buildAthleteModel(state, now = new Date()) {
  const runs = completedRuns(state);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 42);
  const recent = runs.filter(item => parseDate(item.date) >= cutoff);
  const observedPaces = recent.map(paceSeconds).filter(value => value >= 120 && value <= 1200);
  const observedWeeklyKm = recent.reduce((sum, item) => sum + Number(item.distance), 0) / 6;
  const declared = state.trainingProfile?.declared || {};
  const confidence = confidenceFrom(state, runs, now);
  const hasObservedBase = recent.length >= 3;
  const observed = {
    sampleSize: recent.length,
    weeklyKm: round(observedWeeklyKm),
    averageDistanceKm: round(average(recent.map(item => Number(item.distance))) || 0),
    longestRunKm: round(recent.length ? Math.max(...recent.map(item => Number(item.distance))) : 0),
    typicalPaceSeconds: observedPaces.length ? Math.round(median(observedPaces)) : null,
    medianRpe: median(recent.map(item => Number.parseFloat(item.rpe)).filter(Number.isFinite)),
    trend: trendFromRuns(runs),
    firstObservedAt: recent[0]?.date || null,
    lastObservedAt: recent.at(-1)?.date || null
  };
  const declaredWeekly = Number(declared.currentWeeklyKm) || 0;
  const declaredDays = Math.max(1, declared.trainingDays?.length || 3);
  const declaredBaseDistance = Number(declared.longestRunKm) || (declaredWeekly ? declaredWeekly / declaredDays : 3);
  const baseWeeklyKm = hasObservedBase ? observed.weeklyKm : declaredWeekly;
  const requestedWeeklyKm = Number(state.goals?.targetWeeklyKm || state.settings?.weeklyGoal) || Math.max(8, baseWeeklyKm);
  const weeklyGoal = hasObservedBase
    ? clamp(requestedWeeklyKm, Math.max(3, baseWeeklyKm * 0.8), Math.max(8, baseWeeklyKm * 1.2))
    : clamp(requestedWeeklyKm || 8, 3, Math.max(12, declaredWeekly + 6));

  return {
    engineVersion: PACE_ENGINE_VERSION,
    generatedAt: now.toISOString(),
    declared: {
      experience: declared.experience || "beginner", weeklyKm: declaredWeekly,
      longestRunKm: Number(declared.longestRunKm) || 0, typicalPaceSeconds: Number(declared.typicalPaceSeconds) || null,
      trainingDays: declared.trainingDays || [1, 3, 6], sessionMinutes: Number(declared.sessionMinutes) || 45
    },
    observed,
    capabilities: {
      source: hasObservedBase ? "observed" : "declared",
      baseDistanceKm: round(Math.max(2, hasObservedBase ? observed.averageDistanceKm : declaredBaseDistance)),
      longestRunKm: round(Math.max(observed.longestRunKm, Number(declared.longestRunKm) || 0, 3)),
      typicalPaceSeconds: observed.typicalPaceSeconds || Number(declared.typicalPaceSeconds) || 420,
      weeklyGoalKm: round(weeklyGoal)
    },
    confidence,
    safety: {
      hasHealthContext: Boolean(declared.recentInjuries || declared.healthNotes),
      requiresConservativeStart: confidence.level === "low" || declared.experience === "beginner"
    }
  };
}

function ruleExplanation(id) {
  return recommendationRuleById(id)?.explanation || "";
}

export function explainTrainingRecommendation(session, state, model = buildAthleteModel(state)) {
  const reasonCodes = [model.capabilities.source === "observed" ? "observed-profile" : "declared-profile"];
  const sourceRuleIds = ["training-gradual-progression"];
  if (model.confidence.level === "low") {
    reasonCodes.push("low-data-conservative");
    sourceRuleIds.unshift("training-low-data-conservative");
  }
  const score = readinessScore(state.readiness?.[session.date || localISO()]);
  if (score !== null && score < 45) {
    reasonCodes.push("low-readiness");
    sourceRuleIds.unshift("training-readiness-low");
  } else if (score !== null && score < 70) {
    reasonCodes.push("readiness-caution");
    sourceRuleIds.unshift("training-readiness-caution");
  }
  if (/Intervalado|Tempo|Longão|Prova|Teste/.test(session.type || "")) sourceRuleIds.push("training-use-session-rpe");
  const explanations = [...new Set(sourceRuleIds.map(ruleExplanation).filter(Boolean))];
  return {
    ...session,
    recommendation: {
      engineVersion: PACE_ENGINE_VERSION,
      confidence: model.confidence,
      reasonCodes,
      sourceRuleIds: [...new Set(sourceRuleIds)],
      explanations
    }
  };
}
