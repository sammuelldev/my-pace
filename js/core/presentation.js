const localISO = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const GOAL_LABELS = {
  consistency: "Criar uma rotina de corrida",
  "5k": "Conquistar meus 5 km",
  "10k": "Evoluir para os 10 km",
  race: "Preparar minha próxima prova",
  performance: "Melhorar meu desempenho",
  health: "Correr pelo meu bem-estar"
};

export function resolveView(view) {
  return view === "historico" ? "treinos" : view;
}

export function navigationSection(view) {
  const resolved = resolveView(view);
  return ["inicio", "plano", "treinos", "desempenho"].includes(resolved) ? resolved : "mais";
}

export function describeEffort(rpe) {
  const values = String(rpe).match(/\d+/g)?.map(Number) || [];
  if (!values.length) return "Pelo seu esforço";
  const effort = Math.max(...values);
  return effort <= 2 ? "Muito leve" : effort <= 4 ? "Confortável" : effort <= 6 ? "Firme" : effort <= 8 ? "Difícil" : "Muito intenso";
}

// Historical days have no inferred plan: only actual records establish completion.
export function buildWeekSummary(workouts, races, plan, now = new Date()) {
  const today = localISO(now);
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  monday.setDate(monday.getDate() - ((monday.getDay() || 7) - 1));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + index);
    const date = localISO(day);
    const completed = workouts.filter(run => run.date === date && (!run.status || run.status === "completed"));
    const completedRaces = races.filter(race => race.date === date && race.status === "completed" && race.result);
    const session = date >= today ? plan.find(item => item.date === date) : null;
    const distance = completed.reduce((sum, run) => sum + run.distance, 0) + completedRaces.reduce((sum, race) => sum + race.result.distance, 0);
    const status = completed.length || completedRaces.length ? "completed" : session && session.distance > 0 ? "planned" : date < today ? "empty" : "rest";
    return { date, day: day.getDate(), label: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"][index], today: date === today, status, distance, sessionId: session?.id || null };
  });
}

export function nextUnrecordedSession(plan, workouts, races, now = new Date()) {
  const today = localISO(now);
  return plan.find(session => session.date >= today && !(session.race
    ? races.some(race => race.date === session.date && race.status === "completed")
    : workouts.some(run => run.date === session.date && (!run.status || run.status === "completed")))) || null;
}
