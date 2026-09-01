import { buildAthleteModel, readinessScore } from "./pace-engine.js";

export const RACE_ENGINE_VERSION = 1;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const localISO = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseDate = value => new Date(`${value}T12:00:00`);
const daysBetween = (a, b) => Math.ceil((parseDate(b) - parseDate(a)) / 86400000);

function plannedRace(state) {
  return (state.races || []).filter(item => item.status === "planned").sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

function phaseFor(days) {
  if (days < 0) return "result-pending";
  if (days === 0) return "race-day";
  if (days <= 7) return "race-week";
  if (days <= 21) return "specific";
  return "building";
}

export function buildRaceExperience(state, now = new Date()) {
  const race = plannedRace(state);
  if (!race) return { active: false, engineVersion: RACE_ENGINE_VERSION };
  const today = localISO(now);
  const daysToRace = daysBetween(today, race.date);
  const model = buildAthleteModel(state, now);
  const distanceRatio = clamp(model.observed.longestRunKm / Math.max(1, race.distance), 0, 1);
  const consistencyRatio = clamp(model.observed.sampleSize / 6, 0, 1);
  const todayReadiness = readinessScore(state.readiness?.[today]);
  const readinessContribution = todayReadiness === null ? 8 : todayReadiness * 0.15;
  const score = Math.round(clamp(distanceRatio * 35 + consistencyRatio * 25 + model.confidence.score * 0.25 + readinessContribution, 0, 100));
  const level = score >= 75 ? "boa" : score >= 48 ? "em construção" : "incerta";
  const factors = [];
  factors.push(distanceRatio >= 0.8 ? "Sua maior distância recente se aproxima do objetivo." : "A distância recente ainda é menor que o objetivo; controle no início será importante.");
  factors.push(consistencyRatio >= 0.7 ? "Há uma sequência observada útil para orientar a prova." : "Ainda há poucos treinos recentes para reduzir a incerteza.");
  if (todayReadiness !== null && todayReadiness < 45) factors.push("O check-in de hoje pede recuperação e não deve ser ignorado.");
  if (model.safety.hasHealthContext) factors.push("O contexto de saúde informado deve prevalecer sobre metas de tempo.");
  const checklist = state.raceChecklist?.[race.id] || {};
  const checked = Object.values(checklist).filter(Boolean).length;
  return {
    active: true, engineVersion: RACE_ENGINE_VERSION, race, daysToRace,
    phase: phaseFor(daysToRace), score, level, factors,
    checklist: { checked, total: 5, percent: Math.round(checked / 5 * 100) },
    confidence: model.confidence,
    raceWeek: daysToRace >= 0 && daysToRace <= 7,
    guidance: daysToRace === 0
      ? "Hoje, use apenas rotina, alimentação e equipamento já testados. Sinais de alerta vencem qualquer meta."
      : daysToRace > 0 && daysToRace <= 7
        ? "A prioridade desta semana é chegar recuperado. O ganho agora vem de preservar, não de testar a forma."
        : "O plano continua construindo capacidade gradualmente e será reduzido quando a prova se aproximar.",
    sourceRuleIds: ["training-gradual-progression"],
    evidenceStatus: "mixed-evidence-and-conservative-product-policy"
  };
}

export function analyzeRaceResult(race) {
  if (!race?.result) return null;
  const result = race.result;
  const splits = (result.splits || []).filter(Number.isFinite);
  const average = splits.length ? splits.reduce((sum, value) => sum + value, 0) / splits.length : null;
  const spread = splits.length ? Math.max(...splits) - Math.min(...splits) : null;
  const half = Math.floor(splits.length / 2);
  const firstHalf = half ? splits.slice(0, half).reduce((sum, value) => sum + value, 0) / half : null;
  const secondValues = splits.slice(half);
  const secondHalf = secondValues.length ? secondValues.reduce((sum, value) => sum + value, 0) / secondValues.length : null;
  const pacing = !average ? "Sem parciais suficientes para avaliar distribuição."
    : spread <= average * 0.04 ? "Parciais estáveis: o esforço foi bem distribuído."
      : secondHalf < firstHalf ? "A segunda metade foi mais rápida, indicando reserva bem utilizada."
        : "A segunda metade perdeu ritmo; uma largada mais controlada pode ajudar na próxima.";
  const goalDifference = race.goalSeconds ? result.officialSeconds - race.goalSeconds : null;
  const recovery = Number(result.rpe) >= 9 || ["high", "very-high"].includes(result.recoveryNeed)
    ? "Priorize recuperação e retome apenas quando energia e desconforto estiverem normalizados."
    : "Nos próximos dias, prefira descanso ou movimento leve antes de voltar a estímulos exigentes.";
  return {
    engineVersion: RACE_ENGINE_VERSION,
    pacing, averageSplitSeconds: average ? Math.round(average) : null, splitSpreadSeconds: spread,
    goalDifferenceSeconds: goalDifference, recovery,
    feedbackPrompt: "Registre no diário o que funcionou, o que surpreendeu e o que mudaria na próxima largada.",
    evidenceStatus: "descriptive-analysis-and-conservative-product-policy"
  };
}
