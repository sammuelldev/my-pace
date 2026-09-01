import { ACHIEVEMENT_DEFINITIONS } from "../data/achievement-definitions.js";
import { buildAthleteModel } from "./pace-engine.js";

export const PROGRESS_ENGINE_VERSION = 1;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const localISO = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDate = value => new Date(`${value}T12:00:00`);

function allRuns(state) {
  const workouts = (state.workouts || []).filter(item => item.status !== "missed" && item.distance > 0 && item.durationSeconds > 0).map(item => ({ ...item, source: "training" }));
  const races = (state.races || []).filter(item => item.status === "completed" && item.result).map(item => ({
    id: item.id, date: item.date, distance: item.result.distance, durationSeconds: item.result.officialSeconds,
    type: item.name, source: "race"
  }));
  return [...workouts, ...races].sort((a, b) => a.date.localeCompare(b.date));
}

function pace(item) {
  return item.durationSeconds / item.distance;
}

function startOfWeek(date) {
  const value = new Date(date);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  value.setHours(0, 0, 0, 0);
  return value;
}

function weeklyReview(state, runs, now) {
  const start = startOfWeek(now);
  const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999);
  const current = runs.filter(item => { const date = parseDate(item.date); return date >= start && date <= end; });
  const km = current.reduce((sum, item) => sum + item.distance, 0);
  const target = Number(state.goals?.targetWeeklyKm || state.settings?.weeklyGoal) || 10;
  const expectedDays = state.trainingProfile?.declared?.trainingDays?.length || 3;
  const adherence = clamp(current.length / expectedDays * 100, 0, 100);
  const message = !current.length
    ? "A semana ainda pode começar pelo próximo dia possível, sem compensações."
    : adherence < 60 ? "Você manteve algum movimento. O próximo passo é retomar com uma sessão possível."
      : adherence < 100 ? "Boa continuidade. O plano segue ajustando volume e esforço ao que aconteceu."
        : "Semana consistente. Preserve recuperação antes de aumentar a exigência.";
  return { sessions: current.length, km, target, adherence: Math.round(adherence), message, start: localISO(start), end: localISO(end) };
}

function personalRecords(runs) {
  const standards = [1, 3, 5, 10, 21.1, 42.2];
  return standards.map(distance => {
    const matches = runs.filter(item => Math.abs(item.distance - distance) <= Math.max(0.08, distance * 0.025));
    if (!matches.length) return { distance, available: false };
    const best = matches.reduce((winner, item) => item.durationSeconds < winner.durationSeconds ? item : winner);
    return { distance, available: true, durationSeconds: best.durationSeconds, paceSeconds: pace(best), date: best.date, source: best.source };
  });
}

function raceEstimate(state, runs, model) {
  const target = (state.races || []).filter(item => item.status === "planned").sort((a, b) => a.date.localeCompare(b.date))[0]?.distance || 5;
  if (runs.length < 5 || model.confidence.level === "low") {
    return { available: false, targetDistance: target, requiredRuns: Math.max(0, 5 - runs.length), reason: "Registre pelo menos 5 corridas recentes para liberar uma faixa de estimativa." };
  }
  const candidates = runs.slice(-10).filter(item => item.distance >= 2 && target / item.distance <= 4 && item.distance / target <= 2);
  if (!candidates.length) return { available: false, targetDistance: target, requiredRuns: 0, reason: "Ainda faltam atividades com distância comparável ao objetivo." };
  const estimates = candidates.map(item => item.durationSeconds * Math.pow(target / item.distance, 1.06)).sort((a, b) => a - b);
  const midpoint = estimates[Math.floor(estimates.length / 2)];
  const margin = model.confidence.level === "high" ? 0.05 : 0.09;
  return {
    available: true, targetDistance: target,
    lowSeconds: Math.round(midpoint * (1 - margin)), highSeconds: Math.round(midpoint * (1 + margin)),
    confidence: model.confidence.level, sampleSize: candidates.length,
    method: "heuristic-distance-1.06", sourceIds: [], evidenceStatus: "internal-estimation-heuristic"
  };
}

function paceScore(state, runs, review, model, now) {
  const consistency = review.adherence;
  const feedbackSignals = Object.keys(state.readiness || {}).length + (state.recommendationFeedback || []).length;
  const feedback = clamp(feedbackSignals * 8, 0, 100);
  const data = clamp(model.confidence.score, 0, 100);
  const continuityCutoff = new Date(now); continuityCutoff.setDate(continuityCutoff.getDate() - 28);
  const continuity = clamp(runs.filter(item => parseDate(item.date) >= continuityCutoff).length * 15, 0, 100);
  const score = Math.round(consistency * 0.35 + feedback * 0.2 + data * 0.25 + continuity * 0.2);
  return { score, dimensions: { consistency: Math.round(consistency), feedback: Math.round(feedback), data: Math.round(data), continuity: Math.round(continuity) }, label: score >= 75 ? "Base consistente" : score >= 45 ? "Em construção" : "Começando" };
}

function achievementDate(id, state, runs) {
  if (id === "first-run") return runs[0]?.date;
  if (id === "five-runs") return runs[4]?.date;
  if (id === "twenty-runs") return runs[19]?.date;
  if (id === "first-5k") return runs.find(item => item.distance >= 5)?.date;
  if (id === "first-10k") return runs.find(item => item.distance >= 10)?.date;
  if (id === "first-race") return (state.races || []).filter(item => item.status === "completed").sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
  if (id === "readiness-habit") return Object.keys(state.readiness || {}).sort()[4];
  if (id === "feedback-loop") return (state.recommendationFeedback || [])[2]?.createdAt?.slice(0, 10);
  return null;
}

export function reconcileAchievements(state) {
  const runs = allRuns(state);
  const existing = new Map((state.achievements || []).map(item => [item.id, item]));
  ACHIEVEMENT_DEFINITIONS.forEach(definition => {
    const earnedAt = achievementDate(definition.id, state, runs);
    if (earnedAt && !existing.has(definition.id)) existing.set(definition.id, { ...definition, earnedAt, engineVersion: PROGRESS_ENGINE_VERSION });
  });
  return [...existing.values()].sort((a, b) => String(a.earnedAt).localeCompare(String(b.earnedAt)));
}

function journeyTimeline(state, runs, achievements) {
  const items = [
    ...runs.map(item => ({ id: `run-${item.id}`, date: item.date, type: item.source === "race" ? "race" : "workout", title: item.type || "Corrida", detail: `${item.distance.toLocaleString("pt-BR")} km` })),
    ...(state.weights || []).map(item => ({ id: `weight-${item.id}`, date: item.date, type: "body", title: "Métrica corporal registrada", detail: `${item.weight.toLocaleString("pt-BR")} kg` })),
    ...achievements.map(item => ({ id: `achievement-${item.id}`, date: item.earnedAt, type: "achievement", title: item.name, detail: item.description })),
    ...(state.journal || []).map(item => ({ id: `journal-${item.id}`, date: item.date, type: "journal", title: "Nota do diário", detail: item.note }))
  ];
  return items.filter(item => item.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
}

export function buildProgressInsights(state, now = new Date()) {
  const runs = allRuns(state);
  const model = buildAthleteModel(state, now);
  const review = weeklyReview(state, runs, now);
  const achievements = reconcileAchievements(state);
  return {
    engineVersion: PROGRESS_ENGINE_VERSION,
    weeklyReview: review,
    personalRecords: personalRecords(runs),
    raceEstimate: raceEstimate(state, runs, model),
    paceScore: paceScore(state, runs, review, model, now),
    achievements,
    timeline: journeyTimeline(state, runs, achievements),
    trend: model.observed.trend,
    confidence: model.confidence
  };
}
