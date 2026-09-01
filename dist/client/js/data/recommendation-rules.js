export const RECOMMENDATION_RULES_VERSION = 1;

export const RECOMMENDATION_RULES = [
  {
    id: "training-low-data-conservative", version: 1, domain: "training",
    condition: { observedSessionsBelow: 3 },
    action: { confidence: "low", maxQualitySessionsPerWeek: 0, preferCategories: ["easy", "recovery"] },
    explanation: "Há poucos treinos registrados; por isso a sugestão prioriza regularidade e esforço controlado.",
    sourceIds: ["who-physical-activity-2020"]
  },
  {
    id: "training-gradual-progression", version: 1, domain: "training",
    condition: { always: true },
    action: { avoidAbruptIncrease: true },
    explanation: "A progressão considera sua base recente e evita saltos bruscos de frequência, intensidade e duração.",
    sourceIds: ["who-physical-activity-2020"]
  },
  {
    id: "training-readiness-low", version: 1, domain: "readiness",
    condition: { readinessScoreBelow: 45 },
    action: { replaceCategoryWith: "recovery", allowRest: true },
    explanation: "O check-in de hoje indica baixa prontidão; recuperação ou descanso têm prioridade.",
    sourceIds: [],
    evidenceStatus: "internal-conservative-policy"
  },
  {
    id: "training-readiness-caution", version: 1, domain: "readiness",
    condition: { readinessScoreBelow: 70 },
    action: { reduceIntensity: true },
    explanation: "Sono, energia ou desconforto pedem uma execução mais leve hoje.",
    sourceIds: [],
    evidenceStatus: "internal-conservative-policy"
  },
  {
    id: "training-use-session-rpe", version: 1, domain: "feedback",
    condition: { workoutCompleted: true },
    action: { collectRpe: true },
    explanation: "Seu esforço percebido ajuda a interpretar a carga real da sessão, além de distância e ritmo.",
    sourceIds: ["foster-session-rpe-2001"]
  },
  {
    id: "safety-stop-on-warning-signs", version: 1, domain: "safety",
    condition: { warningSignsReported: true },
    action: { stopRecommendation: true, seekProfessionalGuidance: true },
    explanation: "Sinais de alerta prevalecem sobre qualquer treino ou meta.",
    sourceIds: ["acsm-screening-2015"]
  },
  {
    id: "training-no-missed-compensation", version: 1, domain: "adherence",
    condition: { missedWorkout: true },
    action: { doNotStackSessions: true, continueNextAvailableDay: true },
    explanation: "Um treino perdido não precisa ser compensado; o plano continua no próximo dia possível.",
    sourceIds: [],
    evidenceStatus: "internal-conservative-policy"
  }
];

export function recommendationRuleById(id) {
  return RECOMMENDATION_RULES.find(rule => rule.id === id) || null;
}
