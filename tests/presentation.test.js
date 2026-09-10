import test from "node:test";
import assert from "node:assert/strict";
import { buildWeekSummary, nextUnrecordedSession, resolveView, navigationSection, describeEffort } from "../js/core/presentation.js";

test("semana atravessa mês e ano sem inventar sessões passadas", () => {
  const now = new Date(2026, 0, 1, 0, 10);
  const week = buildWeekSummary([], [], [{ date: "2025-12-30", distance: 3 }, { id: "next", date: "2026-01-03", distance: 5 }], now);
  assert.deepEqual(week.map(day => day.date), ["2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
  assert.equal(week[1].status, "empty");
  assert.equal(week[3].today, true);
  assert.equal(week[3].status, "rest");
  assert.equal(week[5].status, "planned");
});

test("registros confirmados prevalecem sobre plano; treinos perdidos não contam", () => {
  const date = "2026-09-09";
  const now = new Date(2026, 8, 9, 23, 59);
  const workouts = [{ date, distance: 3, status: "completed" }, { date, distance: 2, status: "completed" }, { date: "2026-09-08", distance: 8, status: "missed" }];
  const races = [{ date: "2026-09-07", status: "completed", result: { distance: 5 } }];
  const week = buildWeekSummary(workouts, races, [{ date, distance: 5 }], now);
  assert.equal(week[0].status, "completed");
  assert.equal(week[0].distance, 5);
  assert.equal(week[1].status, "empty");
  assert.equal(week[2].status, "completed");
  assert.equal(week[2].distance, 5);
});

test("home avança depois do registro sem esconder prova por causa de uma corrida comum", () => {
  const now = new Date(2026, 8, 9, 12);
  const today = { date: "2026-09-09", distance: 3 };
  const next = { date: "2026-09-12", distance: 5 };
  const workouts = [{ ...today, status: "completed" }];
  assert.equal(nextUnrecordedSession([today, next], workouts, [], now), next);
  const race = { ...today, race: true };
  assert.equal(nextUnrecordedSession([race, next], workouts, [], now), race);
  assert.equal(nextUnrecordedSession([], workouts, [], now), null);
});

test("links antigos e telas secundárias mantêm navegação coerente", () => {
  assert.equal(resolveView("historico"), "treinos");
  assert.equal(navigationSection("historico"), "treinos");
  assert.equal(navigationSection("alimentacao"), "mais");
  assert.equal(navigationSection("configuracoes"), "mais");
  assert.equal(navigationSection("desempenho"), "desempenho");
});

test("esforço aparece em linguagem simples inclusive sem dados", () => {
  assert.equal(describeEffort("3–4"), "Confortável");
  assert.equal(describeEffort("5–6"), "Firme");
  assert.equal(describeEffort("7–9"), "Muito intenso");
  assert.equal(describeEffort("—"), "Pelo seu esforço");
});
