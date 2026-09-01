import {
  createCloudAccount,
  firebaseIsConfigured,
  friendlyFirebaseError,
  initializeCloud,
  removeCloudProfilePhoto,
  saveCloudState,
  sendCloudPasswordReset,
  signInCloud,
  signInWithGoogle,
  signOutCloud,
  uploadProfilePhoto,
  watchCloudState
} from "./cloud.js";
import {
  createDefaultState,
  normalizeEquipment,
  hasMeaningfulData,
  normalizeRace,
  normalizeReadiness,
  normalizeState,
  normalizeWorkout
} from "./core/schema.js";
import { claimLegacyStateForUser, loadLocalState, mergeLocalAndRemote, saveLocalState, userStorageKey } from "./core/storage.js";
import { ONBOARDING_STEPS, applyOnboardingStep, completeOnboarding, onboardingInitialValues, onboardingStep } from "./domains/onboarding.js";
import { buildAthleteModel } from "./domains/pace-engine.js";
import { createAdaptiveTrainingPlan, createTrainingDecision, workoutSubstitutions } from "./domains/training-engine.js";
import { createNutritionFeedback, nutritionRecommendations } from "./domains/nutrition-engine.js";

(() => {
  "use strict";

  const BASELINE_3K_SECONDS = 16 * 60;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  let volatileState = createDefaultState();
  let state;
  try { state = loadLocalState(); }
  catch (_) { state = volatileState; }
  let adaptivePlan = [];
  let selectedPlan = 0;
  let selectedRaceHistory = null;
  let pendingPhoto = state.profile.photo;
  let toastTimer;
  let cloudUser = null;
  let cloudUnsubscribe = null;
  let cloudSaveTimer = null;
  let cloudConfigured = firebaseIsConfigured();
  let applyingCloud = false;
  let lastDeletedWorkout = null;
  let activeStorageKey = null;
  let pendingAccountName = "";
  let onboardingPreparedForUid = null;
  let substitutionSessionId = null;

  function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function localISO(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
  function parseDate(date) { return new Date(`${date}T12:00:00`); }
  function addDays(date, days) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
  function daysBetween(a, b) { return Math.ceil((parseDate(b) - parseDate(a)) / 86400000); }
  function dateLabel(date, long = false) { return new Intl.DateTimeFormat("pt-BR", long ? { weekday: "long", day: "2-digit", month: "long", year: "numeric" } : { day: "2-digit", month: "short" }).format(parseDate(date)); }
  function numberBR(value, digits = 1) { return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
  function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
  function initials(name) { return (name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("") || "P").toUpperCase(); }

  function parseDuration(value) {
    const parts = String(value || "").trim().split(":").map(Number);
    if (parts.some(part => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) return null;
    if (parts.at(-1) > 59 || (parts.length === 3 && parts[1] > 59)) return null;
    return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  function durationLabel(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = String(total % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
  }

  function paceLabel(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "—";
    const total = Math.round(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} /km`;
  }

  function paceShort(seconds) { return paceLabel(seconds).replace(" /km", ""); }
  function paceRange(seconds, spread = 10) { return `${paceShort(seconds - spread)}–${paceShort(seconds + spread)} /km`; }
  function paceSeconds(run) { return Number(run.durationSeconds || run.result?.officialSeconds || 0) / Number(run.distance || run.result?.distance || 1); }

  function persistLocal() {
    try {
      state = activeStorageKey ? saveLocalState(state, localStorage, activeStorageKey) : normalizeState(state);
      volatileState = state;
      return true;
    }
    catch (_) { showToast("Não foi possível salvar. Exporte um backup e verifique o armazenamento do navegador."); return false; }
  }

  function saveState(message) {
    const saved = persistLocal();
    if (message) showToast(message);
    if (saved && cloudUser && !applyingCloud) scheduleCloudSave();
    return saved;
  }

  function scheduleCloudSave() {
    clearTimeout(cloudSaveTimer);
    setCloudUI("saving");
    cloudSaveTimer = setTimeout(async () => {
      try { await saveCloudState(cloudUser?.uid, state); setCloudUI("online"); }
      catch (error) { setCloudUI("error", friendlyFirebaseError(error)); }
    }, 350);
  }

  function showToast(message, action = null) {
    const toast = $("#toast");
    $("#toastMessage").textContent = message;
    const actionButton = $("#toastAction");
    actionButton.hidden = !action;
    actionButton.textContent = action?.label || "";
    actionButton.onclick = action ? () => { action.run(); toast.classList.remove("show"); } : null;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 4200);
  }

  function effectiveWeeklyGoal(profile = athleteProfile()) {
    return state.settings.adaptiveGoal ? profile.weeklyGoal : state.settings.weeklyGoal;
  }

  function readinessScore(item) {
    if (!item) return null;
    return Math.round((item.sleep + item.energy + (6 - item.soreness)) / 15 * 100);
  }

  function resolvedTheme() {
    return state.settings.theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : state.settings.theme;
  }

  function applyTheme() {
    const theme = resolvedTheme();
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const themeColor = $("meta[name=theme-color]");
    if (themeColor) themeColor.content = theme === "light" ? "#f4f7fb" : "#080b12";
    const toggle = $("#themeToggle");
    if (toggle) {
      toggle.textContent = theme === "light" ? "☀" : "☾";
      toggle.setAttribute("aria-label", `Tema ${theme === "light" ? "claro" : "escuro"}. Alternar tema`);
    }
  }

  function setupEnhancements() {
    const main = $("main");
    if (main) { main.id = "mainContent"; main.tabIndex = -1; document.body.insertAdjacentHTML("afterbegin", '<a class="skip-link" href="#mainContent">Pular para o conteúdo</a>'); }
    const mobileActions = document.createElement("div");
    mobileActions.className = "mobile-header-actions";
    mobileActions.innerHTML = '<span class="sync-dot" id="mobileSyncDot" title="Dados salvos neste dispositivo"></span><button class="icon-button" id="themeToggle" type="button" aria-label="Alternar tema">☾</button>';
    const menu = $("#menuButton");
    menu?.parentElement?.insertBefore(mobileActions, menu);
    mobileActions.append(menu);
    menu?.setAttribute("aria-expanded", "false");
    menu?.setAttribute("aria-controls", "sidebar");

    const desktopSync = document.createElement("div");
    desktopSync.className = "sync-badge";
    desktopSync.id = "desktopSync";
    desktopSync.innerHTML = '<i></i><span>Salvo neste dispositivo</span>';
    $(".sidebar-bottom")?.prepend(desktopSync);

    const readiness = document.createElement("article");
    readiness.className = "readiness-card panel";
    readiness.id = "readinessCard";
    readiness.innerHTML = '<div class="readiness-copy"><span class="eyebrow">PRONTIDÃO DE HOJE</span><h3 id="readinessTitle">Como seu corpo acordou?</h3><p class="muted" id="readinessText">Sono, energia e desconforto ajudam o Pace a sugerir a intensidade mais segura para hoje.</p></div><div class="readiness-score" id="readinessScore" aria-label="Prontidão ainda não informada"><strong>—</strong><span>sem check-in</span></div><button class="button" type="button" data-open="readinessModal" id="readinessButton">Fazer check-in</button>';
    $("#inicio .metrics")?.before(readiness);

    const historyInput = $("#historySearch");
    const historyFilters = document.createElement("div");
    historyFilters.className = "history-filters";
    historyInput?.parentElement?.insertBefore(historyFilters, historyInput);
    if (historyInput) { historyInput.placeholder = "Buscar treino, nota ou data…"; historyInput.setAttribute("aria-label", "Buscar no histórico"); historyFilters.append(historyInput); }
    historyFilters.insertAdjacentHTML("beforeend", '<select id="historyType" aria-label="Filtrar por tipo"><option value="">Todos os tipos</option></select><select id="historyPeriod" aria-label="Filtrar por período"><option value="all">Todo o período</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="365">Último ano</option></select>');

    const settingsGrid = $("#configuracoes .settings-grid");
    const oldPlanSetting = settingsGrid?.children[1];
    if (oldPlanSetting) {
      const preferencesButton = document.createElement("button");
      preferencesButton.className = "setting panel";
      preferencesButton.id = "settingsPreferences";
      preferencesButton.type = "button";
      preferencesButton.innerHTML = '<span>◎</span><div><strong>Meta e aparência</strong><small id="preferencesSummary">Meta adaptativa · tema do sistema</small></div><b>›</b>';
      oldPlanSetting.replaceWith(preferencesButton);
    }

    const workoutForm = $("#workoutForm");
    workoutForm?.insertAdjacentHTML("afterbegin", '<input name="workoutId" type="hidden">');
    const workoutTitle = $("#workoutForm h2"); if (workoutTitle) workoutTitle.id = "workoutModalTitle";
    const workoutSubmit = $('#workoutForm button[type="submit"]'); if (workoutSubmit) workoutSubmit.id = "workoutSubmit";

    $$(".checklist input").forEach((input, index) => { input.dataset.checkItem = String(index); });
  }

  function sortedWorkouts() { return [...state.workouts].sort((a, b) => b.date.localeCompare(a.date)); }
  function completedRaces() { return state.races.filter(race => race.status === "completed" && race.result).sort((a, b) => a.date.localeCompare(b.date)); }
  function activeRace() { return state.races.filter(race => race.status === "planned").sort((a, b) => a.date.localeCompare(b.date))[0] || null; }
  function performanceRuns() {
    const regular = state.workouts.map(run => ({ ...run, source: "training" }));
    const official = completedRaces().map(race => ({ id: race.id, date: race.date, distance: race.result.distance, durationSeconds: race.result.officialSeconds, type: race.name, feeling: race.result.feeling, source: "race" }));
    return [...regular, ...official].sort((a, b) => a.date.localeCompare(b.date));
  }

  function athleteProfile() {
    const model = buildAthleteModel(state);
    return {
      baseDistance: model.capabilities.baseDistanceKm,
      longest: model.capabilities.longestRunKm,
      avgPace: model.capabilities.typicalPaceSeconds,
      improvement: model.observed.trend.percent,
      weeklyGoal: model.capabilities.weeklyGoalKm,
      confidence: model.confidence,
      model
    };
  }

  function buildAdaptivePlan() {
    return createAdaptiveTrainingPlan(state);
  }

  function weeklyWorkouts() {
    const now = new Date();
    const day = now.getDay() || 7;
    const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(now.getDate() - day + 1);
    const sunday = addDays(monday, 6);
    return performanceRuns().filter(item => { const date = parseDate(item.date); return date >= monday && date <= sunday; });
  }

  function stats() {
    const runs = performanceRuns();
    const totalKm = runs.reduce((sum, run) => sum + run.distance, 0);
    const longest = runs.length ? Math.max(3, ...runs.map(run => run.distance)) : 3;
    const runs3k = runs.filter(run => Math.abs(run.distance - 3) <= 0.1);
    const runs5k = runs.filter(run => Math.abs(run.distance - 5) <= 0.15);
    return { runs, totalKm, longest, best3k: Math.min(BASELINE_3K_SECONDS, ...runs3k.map(run => run.durationSeconds)), best5k: runs5k.length ? Math.min(...runs5k.map(run => run.durationSeconds)) : null };
  }

  function navigate(view) {
    $$(".view").forEach(section => section.classList.toggle("active", section.id === view));
    $$('[data-view]').forEach(button => button.classList.toggle("active", button.dataset.view === view));
    $("#sidebar").classList.remove("open");
    $("#menuButton")?.setAttribute("aria-expanded", "false");
    window.scrollTo({ top: 0, behavior: "smooth" });
    const heading = $(`#${view} h1`); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }

  function applyAvatar(photo = state.profile.photo, name = state.profile.name) {
    $$(".avatar-render").forEach(avatar => {
      avatar.classList.toggle("has-photo", Boolean(photo));
      avatar.style.backgroundImage = photo ? `url("${photo}")` : "";
      const letters = $("span", avatar); if (letters) letters.textContent = initials(name);
    });
  }

  function renderGreeting() {
    const hour = new Date().getHours();
    $("#greeting").textContent = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  }

  function renderRace() {
    const race = activeRace();
    const today = localISO();
    const hasRace = Boolean(race);
    $("#noRaceHero").hidden = hasRace;
    $("#raceHero").hidden = !hasRace;
    $("#raceMini").hidden = !hasRace;
    $("#raceEmptyState").hidden = hasRace;
    $("#raceActiveContent").hidden = !hasRace;
    $("#raceDayCallout").hidden = true;
    if (!race) return;

    const rawDays = daysBetween(today, race.date);
    const days = Math.max(0, rawDays);
    const cycleTotal = Math.max(1, daysBetween(race.createdAt, race.date));
    const elapsed = clamp(daysBetween(race.createdAt, today), 0, cycleTotal);
    const progress = elapsed / cycleTotal * 100;
    const meta = `${dateLabel(race.date, true)} · ${numberBR(race.distance)} km`;
    $("#raceDays").textContent = days;
    $("#raceDaysLabel").textContent = rawDays === 0 ? "é hoje" : rawDays < 0 ? "resultado pendente" : days === 1 ? "dia para a largada" : "dias para a largada";
    $("#raceHeroMeta").textContent = meta.toUpperCase();
    $("#raceHeroText").textContent = `${race.name}${race.goalSeconds ? ` · meta ${durationLabel(race.goalSeconds)}` : ""}. O plano se ajusta ao seu pace recente.`;
    $("#cyclePercent").textContent = `${Math.round(progress)}%`;
    $("#cycleRing").style.setProperty("--progress", `${progress * 3.6}deg`);
    $("#sidebarRace").textContent = `${numberBR(race.distance)} km · ${dateLabel(race.date)}`;
    $("#sidebarCountdown").textContent = rawDays <= 0 ? "resultado pendente" : `${days} ${days === 1 ? "dia restante" : "dias restantes"}`;
    $("#raceModeDays").textContent = days;
    $("#racePageMeta").textContent = meta;
    $("#raceBibDistance").textContent = numberBR(race.distance, race.distance % 1 ? 1 : 0);
    $("#racePageName").textContent = race.name;
    $("#racePageDetails").textContent = `${race.location || "Local não informado"}${race.goalSeconds ? ` · meta ${durationLabel(race.goalSeconds)}` : " · sem meta de tempo definida"}`;
    $("#raceResultCta").hidden = rawDays > 0;
    $("#raceStrategy").innerHTML = raceStrategy(race).map(item => `<span><strong>${escapeHTML(item.label)}</strong><small>${escapeHTML(item.text)}</small></span>`).join("");
    if (rawDays <= 0) {
      $("#raceDayCallout").hidden = false;
      $("#raceDayName").textContent = race.name;
    }
  }

  function raceStrategy(race) {
    const goalPace = race.goalSeconds ? race.goalSeconds / race.distance : athleteProfile().avgPace;
    const finishStart = Math.max(2, Math.ceil(race.distance * 0.8));
    return [
      { label: "INÍCIO", text: `Primeiros ${numberBR(Math.max(1, race.distance * 0.2))} km controlados · ${paceRange(goalPace + 10, 5)}` },
      { label: "MEIO", text: `Estabilizar respiração e forma · ${paceRange(goalPace, 5)}` },
      { label: `A PARTIR DO KM ${finishStart}`, text: "Sustentar; progredir apenas se houver domínio do esforço" },
      { label: "FINAL", text: "Usar a reserva sem desmontar a passada" }
    ];
  }

  function renderNextWorkout() {
    const session = adaptivePlan[0];
    if (!session) return;
    const today = localISO();
    $("#todayType").textContent = session.type;
    $("#todayDate").textContent = session.date === today ? "Hoje" : dateLabel(session.date);
    $("#todayDistance").textContent = numberBR(session.distance);
    $("#todayRpe").textContent = session.rpe;
    $("#todayPace").textContent = session.pace;
    $("#todayObjective").textContent = `◉ ${session.objective}`;
    $("#todayDetails").textContent = session.details;
    const checkIn = session.date === today ? state.readiness[today] : null;
    const score = readinessScore(checkIn);
    if (score !== null && score < 45) {
      $("#todayRpe").textContent = "2–3";
      $("#todayObjective").textContent = "Recuperar e observar o corpo";
      $("#todayDetails").textContent = "Seu check-in indica baixa prontidão. Prefira descanso ou uma sessão muito leve; dor forte é sinal para não correr.";
    } else if (score !== null && score < 70) {
      $("#todayRpe").textContent = "3–4";
      $("#todayDetails").textContent = `${session.details} Hoje, reduza o ritmo se a sensação de esforço subir cedo.`;
    }
  }

  function renderMetrics() {
    const summary = stats();
    const profile = athleteProfile();
    const weeklyGoal = effectiveWeeklyGoal(profile);
    const week = weeklyWorkouts();
    const weeklyKm = week.reduce((sum, run) => sum + run.distance, 0);
    $("#weeklyKm").textContent = numberBR(weeklyKm);
    $("#weeklyProgress").style.width = `${clamp(weeklyKm / weeklyGoal * 100, 0, 100)}%`;
    $("#weeklyGoal").textContent = `${state.settings.adaptiveGoal ? "Meta adaptativa" : "Meta pessoal"}: ${numberBR(weeklyGoal)} km`;
    $("#weeklyCount").textContent = `${week.length} ${week.length === 1 ? "treino" : "treinos"}`;
    $("#best3k").textContent = durationLabel(summary.best3k);
    $("#best5k").textContent = summary.best5k ? durationLabel(summary.best5k) : "Em construção";
    $("#longestRun").textContent = `${numberBR(summary.longest)} km`;
    $("#totalKm").textContent = `${numberBR(summary.totalKm)} km`;
    $("#totalRuns").textContent = `${summary.runs.length} ${summary.runs.length === 1 ? "corrida" : "corridas"}`;
    $(".performance-metrics").innerHTML = [
      ["Pace recente", paceLabel(profile.avgPace), "Últimos registros"],
      ["Evolução recente", `${profile.improvement >= 0 ? "+" : ""}${numberBR(profile.improvement)}%`, "Comparação de pace"],
      ["Maior distância", `${numberBR(summary.longest)} km`, "Marca atual"],
      ["Volume total", `${numberBR(summary.totalKm)} km`, `${summary.runs.length} corridas`]
    ].map(([label, value, detail]) => `<article><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`).join("");
  }

  function workoutRows(items, limit) {
    const list = typeof limit === "number" ? items.slice(0, limit) : items;
    if (!list.length) return '<div class="empty"><b>Nenhum treino registrado</b><small>Registre uma corrida para iniciar a evolução adaptativa.</small></div>';
    return list.map(run => `<div class="workout-row"><span class="run-icon">↗</span><span><strong>${escapeHTML(run.type)}</strong><small>${escapeHTML(dateLabel(run.date, true))} · RPE ${escapeHTML(run.rpe)}</small></span><span class="numbers"><strong>${numberBR(run.distance, 2)} km</strong><small>${durationLabel(run.durationSeconds)}</small></span><span class="numbers pace"><strong>${paceLabel(paceSeconds(run))}</strong><small>${escapeHTML(run.feeling)}</small></span></div>`).join("");
  }

  function renderWorkouts() {
    const workouts = sortedWorkouts();
    $("#recentWorkouts").innerHTML = workoutRows(workouts, 3);
    $("#trainingList").innerHTML = workoutRows(workouts);
    const typeFilter = $("#historyType");
    if (typeFilter) {
      const selected = typeFilter.value;
      const types = [...new Set(workouts.map(run => run.type))].sort((a, b) => a.localeCompare(b, "pt-BR"));
      typeFilter.innerHTML = '<option value="">Todos os tipos</option>' + types.map(type => `<option value="${escapeHTML(type)}">${escapeHTML(type)}</option>`).join("");
      typeFilter.value = types.includes(selected) ? selected : "";
    }
    renderHistory();
  }

  function renderReadiness() {
    const item = state.readiness[localISO()];
    const score = readinessScore(item);
    const scoreBox = $("#readinessScore");
    if (!scoreBox) return;
    const label = score === null ? "sem check-in" : score >= 70 ? "pronto" : score >= 45 ? "atenção" : "recuperar";
    scoreBox.className = `readiness-score ${score === null ? "" : label}`;
    scoreBox.innerHTML = `<strong>${score ?? "—"}${score === null ? "" : "%"}</strong><span>${label}</span>`;
    scoreBox.setAttribute("aria-label", score === null ? "Prontidão ainda não informada" : `Prontidão ${score} por cento: ${label}`);
    $("#readinessTitle").textContent = score === null ? "Como seu corpo acordou?" : score >= 70 ? "Boa prontidão para treinar" : score >= 45 ? "Treine com atenção" : "Hoje pede recuperação";
    $("#readinessText").textContent = score === null ? "Sono, energia e desconforto ajudam o Pace a sugerir a intensidade mais segura para hoje." : score >= 70 ? "Seu check-in está equilibrado. Ainda assim, ajuste o esforço pelas sensações durante a corrida." : score >= 45 ? "Considere reduzir duração ou intensidade caso o esforço fique alto logo no início." : "Prefira descanso ou atividade muito leve. Não corra com dor forte ou crescente.";
    $("#readinessButton").textContent = score === null ? "Fazer check-in" : "Atualizar check-in";
  }

  function renderPreferences() {
    applyTheme();
    const goal = effectiveWeeklyGoal();
    const themeNames = { system: "tema do sistema", dark: "tema escuro", light: "tema claro" };
    const summary = $("#preferencesSummary");
    if (summary) summary.textContent = `${state.settings.adaptiveGoal ? "Meta adaptativa" : `${numberBR(goal)} km/semana`} · ${themeNames[state.settings.theme]}`;
    const trainingDaysSummary = $("#trainingDaysSummary");
    if (trainingDaysSummary) {
      const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const days = state.trainingProfile.declared.trainingDays.map(day => names[day]).join(" · ");
      trainingDaysSummary.textContent = days || "Nenhum dia definido";
    }
  }

  function renderRaceChecklist() {
    const race = activeRace();
    const values = race ? state.raceChecklist[race.id] || {} : {};
    $$(".checklist input[data-check-item]").forEach(input => { input.checked = Boolean(values[input.dataset.checkItem]); input.disabled = !race; });
  }

  function renderHistory() {
    const term = $("#historySearch").value.trim().toLocaleLowerCase("pt-BR");
    const type = $("#historyType")?.value || "";
    const period = $("#historyPeriod")?.value || "all";
    const cutoff = period === "all" ? null : addDays(new Date(), -Number(period));
    const workouts = sortedWorkouts().filter(run => {
      const matchesSearch = [run.type, run.date, run.notes, run.feeling].join(" ").toLocaleLowerCase("pt-BR").includes(term);
      return matchesSearch && (!type || run.type === type) && (!cutoff || parseDate(run.date) >= cutoff);
    });
    $("#historyCount").textContent = `${workouts.length} ${workouts.length === 1 ? "registro" : "registros"}`;
    $("#historyList").innerHTML = workouts.length ? workouts.map(run => `<div class="workout-row"><span class="run-icon">↗</span><span><strong>${escapeHTML(run.type)}</strong><small>${escapeHTML(dateLabel(run.date, true))}${run.notes ? ` · ${escapeHTML(run.notes)}` : ""}</small></span><span class="numbers"><strong>${numberBR(run.distance, 2)} km</strong><small>${durationLabel(run.durationSeconds)} · ${paceLabel(paceSeconds(run))}</small></span><button class="link-button danger" type="button" data-delete-workout="${escapeHTML(run.id)}">Excluir</button></div>`).join("") : '<div class="empty"><b>Nada encontrado</b><small>Registre uma corrida ou tente outra busca.</small></div>';
    $$("#historyList [data-delete-workout]").forEach(deleteButton => {
      const actions = document.createElement("span");
      actions.className = "row-actions";
      const editButton = document.createElement("button");
      editButton.className = "link-button";
      editButton.type = "button";
      editButton.dataset.editWorkout = deleteButton.dataset.deleteWorkout;
      editButton.textContent = "Editar";
      deleteButton.replaceWith(actions);
      actions.append(editButton, deleteButton);
    });
  }

  function renderPlan() {
    const race = activeRace();
    const profile = athleteProfile();
    selectedPlan = clamp(selectedPlan, 0, Math.max(0, adaptivePlan.length - 1));
    $("#planEyebrow").textContent = race ? "CICLO ADAPTATIVO" : "PLANO CONTÍNUO";
    $("#planTitle").textContent = race ? `Preparação para ${race.name}` : "Treinos adaptativos";
    $("#planSubtitle").textContent = race ? `${numberBR(race.distance)} km em ${dateLabel(race.date, true)}. O plano é recalculado pelo seu ritmo.` : "As próximas sessões usam seu volume e pace recente como referência.";
    $("#planCurrentBase").textContent = `${numberBR(profile.baseDistance)} km`;
    $("#planTargetDistance").textContent = race ? `${numberBR(race.distance)} km` : `${numberBR(effectiveWeeklyGoal(profile))} km`;
    $("#planTargetLabel").textContent = race ? dateLabel(race.date) : "meta semanal";
    const groups = new Map();
    adaptivePlan.forEach((session, index) => {
      const date = parseDate(session.date);
      const monday = addDays(date, -((date.getDay() || 7) - 1));
      const key = localISO(monday);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ ...session, index });
    });
    $("#planList").innerHTML = [...groups.values()].map((sessions, week) => `<div class="plan-week"><span>SEMANA ${week + 1}</span>${sessions.map(session => { const date = parseDate(session.date); return `<button class="plan-item ${session.index === selectedPlan ? "active" : ""} ${session.race ? "race-plan-item" : ""}" data-plan-index="${session.index}"><span class="date"><b>${String(date.getDate()).padStart(2, "0")}</b><small>${date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</small></span><span class="session"><strong>${escapeHTML(session.type)}</strong><small>${numberBR(session.distance)} km · RPE ${escapeHTML(session.rpe)}</small>${session.substituted ? "<em>adaptado por você</em>" : ""}</span><span>›</span></button>`; }).join("")}</div>`).join("");
    renderPlanDetail();
  }

  function renderPlanDetail() {
    const session = adaptivePlan[selectedPlan];
    if (!session) { $("#planDetail").innerHTML = '<div class="empty"><b>Plano sendo preparado</b></div>'; return; }
    const recommendation = session.recommendation;
    const confidenceNames = { low: "baixa", moderate: "moderada", high: "alta" };
    const explanation = recommendation ? `<div class="recommendation-why"><div><span>POR QUE AGORA</span><b class="confidence ${escapeHTML(recommendation.confidence.level)}">Confiança ${confidenceNames[recommendation.confidence.level]}</b></div>${recommendation.explanations.slice(0, 2).map(text => `<p>${escapeHTML(text)}</p>`).join("")}<small>Motor v${recommendation.engineVersion} · ${recommendation.reasonCodes.map(code => escapeHTML(code)).join(" · ")}</small></div>` : "";
    const adaptationActions = session.race ? "" : `<div class="recommendation-actions"><button class="button" type="button" data-substitute-session="${escapeHTML(session.id)}">Trocar treino</button><button class="button" type="button" data-miss-session="${escapeHTML(session.id)}">Não consigo neste dia</button></div>`;
    $("#planDetail").innerHTML = `<span class="eyebrow ${session.race ? "red" : ""}">${escapeHTML(dateLabel(session.date, true).toUpperCase())}</span><h2>${escapeHTML(session.type)}</h2><div class="stats"><span><b>${numberBR(session.distance)} km</b>distância</span><span><b>RPE ${escapeHTML(session.rpe)}</b>esforço</span><span><b>${escapeHTML(session.pace)}</b>ritmo</span></div><div class="detail-block"><span>OBJETIVO</span><p>${escapeHTML(session.objective)}</p></div><div class="detail-block"><span>COMO FAZER</span><p>${escapeHTML(session.details)}</p></div>${explanation}${adaptationActions}${session.race ? '<button class="button race-button full" data-open="raceResultModal">Registrar resultado</button>' : '<button class="button primary full" data-open="workoutModal">＋ Registrar este treino</button>'}`;
  }

  function renderNutrition() {
    const today = localISO();
    const todaySession = adaptivePlan.find(session => session.date === today);
    const guidance = nutritionRecommendations(state, todaySession, today);
    const slotMarkup = guidance.slots.map(slot => {
      if (!slot.selected) return `<article class="meal-option empty-meal"><span>${escapeHTML(slot.label)}</span><strong>Sem opção compatível</strong><small>Revise alergias e restrições ou converse com nutricionista.</small></article>`;
      return `<article class="meal-option"><span>${escapeHTML(slot.label)}</span><strong>${escapeHTML(slot.selected.name)}</strong><small>${escapeHTML(slot.selected.ingredients.join(" · "))}</small><p>${escapeHTML(slot.reason)}</p><div><button class="text-button" type="button" data-nutrition-action="liked" data-nutrition-date="${today}" data-nutrition-slot="${slot.id}" data-meal-id="${escapeHTML(slot.selected.id)}">Gostei</button><button class="text-button" type="button" data-nutrition-swap="${slot.id}" data-nutrition-date="${today}">Trocar</button><button class="text-button danger" type="button" data-nutrition-action="disliked" data-nutrition-date="${today}" data-nutrition-slot="${slot.id}" data-meal-id="${escapeHTML(slot.selected.id)}">Não serve</button></div></article>`;
    }).join("");
    $("#nutritionToday").classList.add("nutrition-recommendation");
    $("#nutritionToday").innerHTML = `<div class="nutrition-context"><span class="eyebrow">FOCO DE HOJE · ${escapeHTML(guidance.level.toUpperCase())}</span><h2>${todaySession ? `${numberBR(todaySession.distance)} km · RPE ${escapeHTML(todaySession.rpe)}` : "Rotina sem corrida"}</h2><p>${escapeHTML(guidance.focus)}</p><small>Hidratação: ${escapeHTML(guidance.hydration)}</small></div><div class="nutrition-meals">${slotMarkup}</div><p class="nutrition-safety">${escapeHTML(guidance.safetyNote)} · Motor nutricional v${guidance.engineVersion}</p>`;
    const planByDate = new Map(adaptivePlan.map(session => [session.date, session]));
    const days = Array.from({ length: 7 }, (_, index) => localISO(addDays(parseDate(today), index)));
    $("#nutritionWeek").innerHTML = days.map(date => { const item = nutritionRecommendations(state, planByDate.get(date), date); return `<div class="nutrition-day"><span><b>${escapeHTML(parseDate(date).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""))}</b><small>${escapeHTML(dateLabel(date))}</small></span><div><strong>${escapeHTML(item.level)}</strong><small>${escapeHTML(item.focus)}</small></div></div>`; }).join("");
    $("#nutritionContext").textContent = state.nutritionProfile?.goal === "body-composition"
      ? "Refeições consistentes alinhadas ao seu objetivo corporal"
      : "Refeições consistentes para sustentar treino e recuperação";
  }

  function saveNutritionInteraction({ date, slot, mealId, action }) {
    state.nutritionHistory.push(createNutritionFeedback({ date, slot, mealId, action }));
    saveState(action === "liked" ? "Preferência salva para próximas sugestões." : action === "disliked" ? "Essa opção perderá prioridade." : "Refeição substituída.");
    renderNutrition();
  }

  function swapNutritionOption(date, slotId) {
    const session = adaptivePlan.find(item => item.date === date);
    const guidance = nutritionRecommendations(state, session, date);
    const slot = guidance.slots.find(item => item.id === slotId);
    if (!slot || slot.options.length < 2) { showToast("Não há outra opção compatível com seu perfil agora."); return; }
    const currentIndex = slot.options.findIndex(item => item.id === slot.selected?.id);
    const next = slot.options[(currentIndex + 1) % slot.options.length];
    saveNutritionInteraction({ date, slot: slotId, mealId: next.id, action: "selected" });
  }

  function shoeDistance(shoe) {
    const trainingKm = state.workouts.filter(run => run.shoe === shoe.id).reduce((sum, run) => sum + run.distance, 0);
    const raceKm = completedRaces().filter(race => race.result.shoe === shoe.id).reduce((sum, race) => sum + race.result.distance, 0);
    return shoe.totalKm + trainingKm + raceKm;
  }

  function renderEquipment() {
    $("#equipmentList").innerHTML = state.equipment.length ? state.equipment.map(shoe => { const km = shoeDistance(shoe); const progress = clamp(km / shoe.lifespan * 100, 0, 100); return `<article class="shoe-card ${shoe.planned ? "planned" : ""}"><div class="shoe-top"><span class="shoe-symbol">⌁</span><span class="chip">${shoe.planned ? "PLANEJADO" : escapeHTML(shoe.type)}</span></div><h2>${escapeHTML(shoe.name)}</h2><p>${shoe.planned ? "Pronto para ser ativado quando entrar na rotação." : "Quilometragem atualizada pelos registros."}</p><div class="progress"><i style="width:${progress}%"></i></div><div class="shoe-stats"><span>${numberBR(km)} km usados</span><span>${numberBR(shoe.lifespan)} km estimados</span></div></article>`; }).join("") : '<article class="panel empty"><b>Nenhum tênis adicionado</b><small>Adicione um modelo para acompanhar a quilometragem.</small></article>';
    const options = '<option value="">Não informar</option>' + state.equipment.filter(shoe => !shoe.planned).map(shoe => `<option value="${escapeHTML(shoe.id)}">${escapeHTML(shoe.name)}</option>`).join("");
    $("#workoutShoe").innerHTML = options;
    const raceShoe = $("#raceShoe"); if (raceShoe) raceShoe.innerHTML = options;
  }

  function renderWeight() {
    const weights = [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
    if (!weights.length) {
      $("#currentWeight").textContent = "—";
      $("#weightInput").value = "";
      $("#weightSummary").textContent = "Nenhum registro ainda";
      $("#weightProgress").style.width = "0%";
      lineChart($("#weightChart"), [], item => item.weight, value => numberBR(value, 1), "weight", "#4d8dff");
      return;
    }
    const first = weights[0].weight;
    const current = weights.at(-1).weight;
    const gained = current - first;
    $("#currentWeight").textContent = numberBR(current);
    $("#weightInput").value = current;
    $("#weightSummary").textContent = `${gained >= 0 ? "+" : ""}${numberBR(gained)} kg desde o início`;
    $("#weightProgress").style.width = `${clamp(weights.length / 12 * 100, 8, 100)}%`;
    lineChart($("#weightChart"), weights, item => item.weight, value => numberBR(value, 1), "weight", "#4d8dff");
  }

  function lineChart(container, data, valueOf, formatter, id, accent = "#4d8dff", lowerBetter = false) {
    if (!data.length) { container.innerHTML = '<div class="empty"><b>Gráfico aguardando dados</b><small>Registre informações para ver a evolução.</small></div>'; return; }
    const width = 620, height = 230, px = 48, py = 30;
    const values = data.map(valueOf); let min = Math.min(...values), max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    const x = index => px + index * ((width - px * 2) / Math.max(1, data.length - 1));
    const y = value => lowerBetter ? py + (value - min) / (max - min) * (height - py * 2) : py + (max - value) / (max - min) * (height - py * 2);
    const points = data.map((item, index) => `${x(index)},${y(valueOf(item))}`).join(" ");
    const area = `${px},${height - py} ${points} ${x(data.length - 1)},${height - py}`;
    const grids = [0, 1, 2, 3].map(step => { const gy = py + step * ((height - py * 2) / 3); const value = lowerBetter ? min + step * ((max - min) / 3) : max - step * ((max - min) / 3); return `<line class="grid" x1="${px}" y1="${gy}" x2="${width - px}" y2="${gy}"/><text x="3" y="${gy + 4}">${escapeHTML(formatter(value))}</text>`; }).join("");
    const dots = data.map((item, index) => `<circle class="point" style="stroke:${accent}" cx="${x(index)}" cy="${y(valueOf(item))}" r="4"><title>${escapeHTML(dateLabel(item.date))}: ${escapeHTML(formatter(valueOf(item)))}</title></circle>`).join("");
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img"><defs><linearGradient id="gradient-${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${accent}" stop-opacity=".32"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs>${grids}<polygon points="${area}" fill="url(#gradient-${id})"/><polyline class="line" style="stroke:${accent}" points="${points}"/>${dots}</svg>`;
  }

  function barChart(container, data, accent = "#4d8dff") {
    if (!data.length) { container.innerHTML = '<div class="empty"><b>Gráfico aguardando treinos</b></div>'; return; }
    const width = 620, height = 230, px = 38, py = 28, max = Math.max(1, ...data.map(item => item.distance));
    const slot = (width - px * 2) / data.length, barWidth = Math.max(7, slot - 9);
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img">${[0, 1, 2, 3].map(step => { const gy = py + step * ((height - py * 2) / 3); return `<line class="grid" x1="${px}" y1="${gy}" x2="${width - px}" y2="${gy}"/>`; }).join("")}${data.map((item, index) => { const h = item.distance / max * (height - py * 2); return `<rect class="bar" style="fill:${accent}" x="${px + index * slot + 4}" y="${height - py - h}" width="${barWidth}" height="${h}" rx="4"><title>${escapeHTML(dateLabel(item.date))}: ${numberBR(item.distance, 2)} km</title></rect>`; }).join("")}</svg>`;
  }

  function renderCharts() {
    const runs = performanceRuns().slice(-14);
    lineChart($("#paceChart"), runs, paceSeconds, paceLabel, "pace-home", "#4d8dff", true);
    lineChart($("#performancePaceChart"), runs, paceSeconds, paceLabel, "pace-performance", "#4d8dff", true);
    barChart($("#distanceChart"), runs);
  }

  function renderRaceHistory() {
    const races = completedRaces();
    $("#raceHistoryEmpty").hidden = races.length > 0;
    $("#raceHistoryDashboard").hidden = races.length === 0;
    if (!races.length) return;
    if (!selectedRaceHistory || !races.some(race => race.id === selectedRaceHistory)) selectedRaceHistory = races.at(-1).id;
    const selected = races.find(race => race.id === selectedRaceHistory) || races.at(-1);
    $("#raceHistorySelect").innerHTML = races.map(race => `<option value="${escapeHTML(race.id)}" ${race.id === selected.id ? "selected" : ""}>${escapeHTML(race.name)} · ${escapeHTML(dateLabel(race.date))}</option>`).join("");
    $("#raceHistoryList").innerHTML = [...races].reverse().map(race => `<button class="race-history-card ${race.id === selected.id ? "active" : ""}" data-race-history="${escapeHTML(race.id)}"><span><b>${escapeHTML(race.name)}</b><small>${escapeHTML(dateLabel(race.date, true))}</small></span><strong>${durationLabel(race.result.officialSeconds)}</strong><em>${paceLabel(race.result.officialSeconds / race.result.distance)}</em></button>`).join("");
    const result = selected.result;
    const goalDiff = selected.goalSeconds ? result.officialSeconds - selected.goalSeconds : null;
    $("#raceHistoryMetrics").innerHTML = [
      ["Tempo oficial", durationLabel(result.officialSeconds)],
      ["Pace oficial", paceLabel(result.officialSeconds / result.distance)],
      ["Meta", selected.goalSeconds ? `${goalDiff <= 0 ? "−" : "+"}${durationLabel(Math.abs(goalDiff))}` : "Sem meta"],
      ["Colocação", result.placement ? `${result.placement}º geral` : "Não informada"]
    ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
    lineChart($("#raceEvolutionChart"), races, race => race.result.officialSeconds / race.result.distance, paceLabel, "race-evolution", "#ff4d5f", true);
    splitChart($("#raceSplitsChart"), selected);
  }

  function splitChart(container, race) {
    const splits = race.result.splits;
    if (!splits.length) { container.innerHTML = '<div class="empty"><b>Sem parciais registradas</b><small>Edite o resultado futuramente ou registre as parciais na próxima prova.</small></div>'; return; }
    const width = 620, height = 230, px = 38, py = 28, min = Math.min(...splits) * 0.94, max = Math.max(...splits) * 1.04;
    const slot = (width - px * 2) / splits.length, barWidth = Math.max(12, slot - 12), average = splits.reduce((sum, value) => sum + value, 0) / splits.length;
    const y = value => py + (value - min) / Math.max(1, max - min) * (height - py * 2);
    const avgY = y(average);
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img"><line x1="${px}" y1="${avgY}" x2="${width - px}" y2="${avgY}" stroke="#ff8995" stroke-dasharray="5 5"/><text x="${width - 138}" y="${avgY - 7}" fill="#ff8995">média ${paceShort(average)}</text>${splits.map((split, index) => { const top = y(split); const h = height - py - top; return `<rect x="${px + index * slot + 6}" y="${top}" width="${barWidth}" height="${h}" rx="5" fill="${split === Math.min(...splits) ? "#ff3147" : "#a52f3c"}"><title>Km ${index + 1}: ${paceShort(split)}</title></rect><text x="${px + index * slot + slot / 2}" y="${height - 8}" text-anchor="middle">${index + 1}</text><text x="${px + index * slot + slot / 2}" y="${top - 7}" text-anchor="middle" fill="#ff8995">${paceShort(split)}</text>`; }).join("")}</svg>`;
  }

  function renderAll() {
    adaptivePlan = buildAdaptivePlan();
    $$(".profile-name").forEach(item => item.textContent = state.profile.name);
    applyAvatar();
    renderGreeting();
    renderRace();
    renderNextWorkout();
    renderReadiness();
    renderMetrics();
    renderWorkouts();
    renderPlan();
    renderNutrition();
    renderEquipment();
    renderWeight();
    renderCharts();
    renderRaceHistory();
    renderRaceChecklist();
    renderPreferences();
  }

  function openProfileModal() { pendingPhoto = state.profile.photo; $("#profileNameInput").value = state.profile.name; applyAvatar(pendingPhoto, state.profile.name); $("#profileModal").showModal(); }

  function openWorkoutForm(workout = null) {
    const form = $("#workoutForm");
    form.reset();
    form.elements.workoutId.value = workout?.id || "";
    form.elements.date.value = workout?.date || localISO();
    if (workout) {
      form.elements.distance.value = workout.distance;
      form.elements.duration.value = durationLabel(workout.durationSeconds);
      form.elements.rpe.value = workout.rpe;
      form.elements.type.value = workout.type;
      form.elements.feeling.value = workout.feeling;
      form.elements.stitch.value = workout.stitch;
      form.elements.shoe.value = workout.shoe;
      form.elements.notes.value = workout.notes;
    }
    $("#workoutModalTitle").textContent = workout ? "Editar corrida" : "Como foi a corrida?";
    $("#workoutSubmit").textContent = workout ? "Salvar alterações" : "Salvar treino e adaptar plano";
    $("#workoutModal").showModal();
  }

  function openPreferences() {
    const form = $("#preferencesForm");
    form.elements.adaptiveGoal.checked = state.settings.adaptiveGoal;
    form.elements.weeklyGoal.value = state.settings.weeklyGoal;
    form.elements.weeklyGoal.disabled = state.settings.adaptiveGoal;
    form.elements.theme.value = state.settings.theme;
    $("#preferencesModal").showModal();
  }

  function openSubstitution(session) {
    substitutionSessionId = session.id;
    const options = workoutSubstitutions(session);
    $("#substitutionIntro").textContent = `${dateLabel(session.date, true)} · sugestão atual: ${session.type}.`;
    $("#substitutionOptions").innerHTML = options.length ? options.map(option => `<button class="substitution-option" type="button" data-replacement-id="${escapeHTML(option.workoutId)}"><span><strong>${escapeHTML(option.name)}</strong><small>${escapeHTML(option.objective)}</small></span><b>RPE ${escapeHTML(option.rpe)}</b></button>`).join("") : '<div class="empty"><b>Sem troca equivalente</b><small>Você ainda pode marcar que não conseguiu treinar.</small></div>';
    $("#substitutionModal").showModal();
  }

  function saveTrainingDecision(action, replacementWorkoutId = null) {
    const session = adaptivePlan.find(item => item.id === substitutionSessionId);
    if (!session) { showToast("A sessão mudou. Abra o plano e tente novamente."); return; }
    state.recommendationFeedback.push(createTrainingDecision(session, action, replacementWorkoutId));
    saveState(action === "missed" ? "Tudo bem. O treino não será acumulado nem cobrado depois." : "Treino trocado. O restante do plano foi preservado.");
    $("#substitutionModal").close();
    substitutionSessionId = null; selectedPlan = 0; renderAll();
  }
  function handlePhoto(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { showToast("Escolha uma foto JPG, PNG ou WebP."); return; }
    if (file.size > 8 * 1024 * 1024) { showToast("A foto precisa ter no máximo 8 MB."); return; }
    const reader = new FileReader();
    reader.onload = event => { const image = new Image(); image.onload = () => { const size = Math.min(image.width, image.height), sx = (image.width - size) / 2, sy = (image.height - size) / 2; const canvas = document.createElement("canvas"); canvas.width = 420; canvas.height = 420; const context = canvas.getContext("2d"); context.drawImage(image, sx, sy, size, size, 0, 0, 420, 420); pendingPhoto = canvas.toDataURL("image/jpeg", 0.78); applyAvatar(pendingPhoto, $("#profileNameInput").value || state.profile.name); showToast("Foto pronta. Clique em Salvar perfil."); }; image.onerror = () => showToast("Não foi possível ler essa imagem."); image.src = event.target.result; }; reader.readAsDataURL(file);
  }

  function openRaceForm(edit = false) {
    const form = $("#nextRaceForm");
    form.reset();
    form.elements.date.min = localISO();
    const race = activeRace();
    if ((edit || race) && race) {
      form.elements.raceId.value = race.id; form.elements.name.value = race.name; form.elements.date.value = race.date;
      form.elements.distance.value = race.distance; form.elements.location.value = race.location;
      form.elements.goalTime.value = race.goalSeconds ? durationLabel(race.goalSeconds) : "";
    } else { form.elements.raceId.value = ""; form.elements.date.value = localISO(addDays(new Date(), 42)); form.elements.distance.value = 5; }
    $("#nextRaceModal").showModal();
  }

  function prepareRaceResult() {
    const race = activeRace();
    if (!race) { showToast("Adicione uma prova antes de registrar o resultado."); return false; }
    const form = $("#raceResultForm"); form.reset(); form.elements.raceId.value = race.id; form.elements.distance.value = race.distance;
    $("#raceResultIntro").textContent = `${race.name} · ${numberBR(race.distance)} km · ${dateLabel(race.date, true)}`;
    return true;
  }

  function fillOnboardingForm() {
    const form = $("#onboardingForm");
    const values = onboardingInitialValues(state, cloudUser || {});
    Object.entries(values).forEach(([name, value]) => {
      const field = form.elements[name];
      if (!field) return;
      if (name === "trainingDays") {
        [...field].forEach(input => { input.checked = value.includes(Number(input.value)); });
      } else if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = value ?? "";
    });
    $("#onboardingRaceFields").hidden = !form.elements.hasRace.checked;
  }

  function onboardingFormValues() {
    const form = $("#onboardingForm");
    const data = new FormData(form);
    return {
      ...Object.fromEntries(data),
      trainingDays: data.getAll("trainingDays"),
      hasRace: form.elements.hasRace.checked,
      safetyConfirmed: form.elements.safetyConfirmed.checked
    };
  }

  function renderOnboarding() {
    const index = onboardingStep(state);
    const step = ONBOARDING_STEPS[index];
    $$("[data-onboarding-step]").forEach(section => { section.hidden = section.dataset.onboardingStep !== step.id; });
    $("#onboardingEyebrow").textContent = step.eyebrow;
    $("#onboardingTitle").textContent = step.title;
    $("#onboardingProgressLabel").textContent = `Etapa ${index + 1} de ${ONBOARDING_STEPS.length}`;
    $("#onboardingProgressBar").style.width = `${(index + 1) / ONBOARDING_STEPS.length * 100}%`;
    $("#onboardingBack").hidden = index === 0;
    $("#onboardingSaveExit").hidden = index === ONBOARDING_STEPS.length - 1;
    $("#onboardingNext").textContent = index === 0 ? "Começar" : index === ONBOARDING_STEPS.length - 1 ? "Entrar no MyPace" : "Salvar e continuar";
    $("#onboardingMessage").textContent = "";
    if (step.id === "finish") {
      const declared = state.trainingProfile.declared;
      const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      $("#onboardingFinishName").textContent = `${state.profile.name}, seu ponto de partida está pronto.`;
      $("#onboardingSummary").innerHTML = [
        ["Objetivo", { consistency: "Criar consistência", "5k": "5 km", "10k": "10 km", race: "Preparar prova", performance: "Desempenho", health: "Saúde" }[state.goals.primary] || state.goals.primary],
        ["Disponibilidade", declared.trainingDays.map(day => dayNames[day]).join(" · ") || "A definir"],
        ["Confiança inicial", state.workouts.length >= 3 ? "Moderada" : "Em construção"]
      ].map(([label, value]) => `<span>${escapeHTML(label)}<b>${escapeHTML(value)}</b></span>`).join("");
    }
  }

  function validateOnboardingStep(stepId, values) {
    if (stepId === "basics" && !String(values.name || "").trim()) return "Conte como devemos chamar você.";
    if (stepId === "history" && values.typicalPace && !/^\d{1,2}:[0-5]\d$/.test(values.typicalPace)) return "Use o pace no formato min:seg, por exemplo 6:30.";
    if (stepId === "availability" && !values.trainingDays.length) return "Escolha pelo menos um dia possível para treinar.";
    if (stepId === "race" && values.hasRace && (!values.raceName || !values.raceDate)) return "Informe o nome e a data da prova, ou desligue a opção de prova.";
    if (stepId === "safety" && !values.safetyConfirmed) return "Confirme que entendeu os limites de segurança para continuar.";
    return "";
  }

  function openOnboardingIfNeeded() {
    if (!cloudUser || state.onboarding.completed) return;
    if (onboardingPreparedForUid !== cloudUser.uid) {
      fillOnboardingForm();
      onboardingPreparedForUid = cloudUser.uid;
    }
    renderOnboarding();
    const dialog = $("#onboardingModal");
    if (!dialog.open) dialog.showModal();
  }

  function setAuthMessage(message = "", success = false) {
    const target = $("#authMessage");
    if (!target) return;
    target.textContent = message;
    target.classList.toggle("success", success);
  }

  function showAuthMode(mode = "login") {
    const config = {
      login: ["Entre no MyPace", "Acesse seus treinos e recomendações em qualquer dispositivo."],
      signup: ["Crie seu espaço", "Leva menos de um minuto. Depois, vamos personalizar o seu ponto de partida."],
      reset: ["Recupere sua senha", "Enviaremos as instruções para o e-mail da sua conta."]
    };
    const selected = config[mode] ? mode : "login";
    $("#authTitle").textContent = config[selected][0];
    $("#authSubtitle").textContent = config[selected][1];
    $("#authLoginForm").hidden = selected !== "login";
    $("#authSignupForm").hidden = selected !== "signup";
    $("#authResetForm").hidden = selected !== "reset";
    $("#authGoogle").hidden = selected === "reset";
    $("#authCard .form-divider").hidden = selected === "reset";
    $("#authCard .auth-tabs").hidden = selected === "reset";
    $$("[data-auth-mode]", $("#authCard")).forEach(button => {
      const active = button.dataset.authMode === selected;
      if (button.getAttribute("role") === "tab") {
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
      }
    });
    setAuthMessage();
  }

  function showSignedOutRoute() {
    document.body.classList.remove("authenticated");
    $("#productApp").hidden = true;
    $("#authGate").hidden = false;
    $("#authLoading").hidden = true;
    $("#authConfig").hidden = cloudConfigured;
    $("#authForms").hidden = !cloudConfigured;
    if (cloudConfigured) showAuthMode("login");
  }

  function showAuthenticatedRoute() {
    $("#authGate").hidden = true;
    $("#productApp").hidden = false;
    document.body.classList.add("authenticated");
    renderAll();
    setTimeout(openOnboardingIfNeeded, 0);
  }

  function prepareUserLocalState(user) {
    activeStorageKey = userStorageKey(user.uid);
    let scoped = createDefaultState();
    try { scoped = loadLocalState(localStorage, activeStorageKey); }
    catch (_) { scoped = createDefaultState(); }
    const legacy = hasMeaningfulData(scoped) ? null : claimLegacyStateForUser(user.uid);
    state = hasMeaningfulData(scoped) ? scoped : (legacy || scoped);
    const accountName = pendingAccountName || user.displayName || "";
    if (state.profile.name === "Atleta" && accountName) state.profile.name = accountName.slice(0, 40);
    pendingPhoto = state.profile.photo;
    pendingAccountName = "";
  }

  async function runAuthAction(form, action, busyText) {
    const submit = form.querySelector('button[type="submit"]');
    const original = submit.textContent;
    setAuthMessage();
    submit.disabled = true;
    submit.textContent = busyText;
    try { await action(); }
    catch (error) { setAuthMessage(friendlyFirebaseError(error)); }
    finally { submit.disabled = false; submit.textContent = original; }
  }

  function setCloudUI(mode, detail = "") {
    const modes = {
      local: ["Modo local", "Firebase ainda não configurado", "Firebase não conectado", "O site continua salvando neste navegador."],
      connecting: ["Conectando…", "Verificando sua conta", "Conectando ao Firebase", "Aguarde enquanto o painel verifica sua sessão."],
      saving: ["Salvando…", cloudUser?.email || "Conta conectada", "Salvando na nuvem", "Suas alterações estão sendo sincronizadas."],
      signedOut: ["Nuvem disponível", "Entre para sincronizar", "Firebase pronto", "Entre com sua conta privada para sincronizar seus dados."],
      online: ["Sincronizado", cloudUser?.email || "Conta conectada", "Dados protegidos na nuvem", `Conectado como ${cloudUser?.email || "usuário autenticado"}.`],
      error: ["Falha de sincronização", detail || "Confira sua conexão", "Não foi possível sincronizar", detail || "Os dados continuam neste navegador."]
    };
    const values = modes[mode] || modes.local;
    $("#cloudStatus").textContent = values[0]; $("#cloudStatusDetail").textContent = values[1]; $("#cloudCardTitle").textContent = values[2]; $("#cloudCardText").textContent = values[3];
    $("#cloudAction").textContent = mode === "online" || mode === "saving" ? "Conta conectada" : "Entrar na nuvem"; $("#cloudAction").disabled = ["connecting", "saving", "online"].includes(mode); $("#cloudSignOut").hidden = !["online", "saving"].includes(mode) && !(mode === "error" && cloudUser);
    const syncLabel = mode === "online" ? "Sincronizado na nuvem" : ["connecting", "saving"].includes(mode) ? "Sincronizando…" : mode === "error" ? "Falha ao sincronizar" : "Salvo neste dispositivo";
    const desktopSync = $("#desktopSync");
    if (desktopSync) { desktopSync.className = `sync-badge ${mode}`; $("span", desktopSync).textContent = syncLabel; }
    const mobileSync = $("#mobileSyncDot");
    if (mobileSync) { mobileSync.className = `sync-dot ${mode}`; mobileSync.title = syncLabel; }
  }

  async function handleCloudUser(user) {
    cloudUnsubscribe?.(); cloudUnsubscribe = null; cloudUser = user;
    if (!user) {
      activeStorageKey = null;
      state = createDefaultState();
      pendingPhoto = null;
      onboardingPreparedForUid = null;
      if ($("#onboardingModal")?.open) $("#onboardingModal").close();
      setCloudUI(cloudConfigured ? "signedOut" : "local");
      showSignedOutRoute();
      return;
    }
    prepareUserLocalState(user);
    setCloudUI("connecting"); let firstSnapshot = true;
    cloudUnsubscribe = watchCloudState(user.uid, async (remoteState, cloudMeta = {}) => {
      if (remoteState) {
        const wasFirstSnapshot = firstSnapshot;
        firstSnapshot = false;
        const normalizedRemote = normalizeState(remoteState);
        const nextState = wasFirstSnapshot ? mergeLocalAndRemote(state, normalizedRemote) : normalizedRemote;
        const shouldPersistMigration = wasFirstSnapshot && (cloudMeta.source === "legacy" || JSON.stringify(nextState) !== JSON.stringify(normalizedRemote));
        applyingCloud = true; state = nextState; persistLocal(); renderAll(); applyingCloud = false;
        if ((state.settings.onboarded || state.workouts.length) && $("#onboardingModal").open) $("#onboardingModal").close();
        setCloudUI("online");
        if (shouldPersistMigration) await saveCloudState(user.uid, state);
        showAuthenticatedRoute();
        if (wasFirstSnapshot) showToast(cloudMeta.source === "legacy" ? "Dados antigos migrados com segurança." : "Dados sincronizados com a nuvem.");
        return;
      }
      if (firstSnapshot) { firstSnapshot = false; try { if (state.profile.photo?.startsWith("data:image/")) { state.profile.photo = await uploadProfilePhoto(user.uid, state.profile.photo); pendingPhoto = state.profile.photo; persistLocal(); } await saveCloudState(user.uid, state); setCloudUI("online"); showAuthenticatedRoute(); showToast(hasMeaningfulData(state) ? "Dados locais enviados para a sua conta." : "Sua conta está pronta."); } catch (error) { setCloudUI("error", friendlyFirebaseError(error)); setAuthMessage(friendlyFirebaseError(error)); showSignedOutRoute(); } }
    }, error => setCloudUI("error", friendlyFirebaseError(error)));
  }

  async function startCloud() {
    if (!cloudConfigured) { setCloudUI("local"); showSignedOutRoute(); return; }
    setCloudUI("connecting");
    const result = await initializeCloud(handleCloudUser, error => { setCloudUI("error", friendlyFirebaseError(error)); showSignedOutRoute(); setAuthMessage(friendlyFirebaseError(error)); });
    cloudConfigured = result.configured;
  }
  function openCloudLogin() { if (!cloudConfigured) { showToast("Configure js/firebase-config.js seguindo o guia do projeto."); return; } showSignedOutRoute(); showAuthMode("login"); }

  function bindEvents() {
    document.addEventListener("click", event => {
      const authModeButton = event.target.closest("[data-auth-mode]");
      if (authModeButton) showAuthMode(authModeButton.dataset.authMode);
      const viewButton = event.target.closest("[data-view]"); if (viewButton) navigate(viewButton.dataset.view);
      const modalButton = event.target.closest("[data-open]");
      if (modalButton) {
        const id = modalButton.dataset.open;
        if (id === "nextRaceModal") { openRaceForm(); return; }
        if (id === "raceResultModal") { if (prepareRaceResult()) $("#raceResultModal").showModal(); return; }
        if (id === "workoutModal") { openWorkoutForm(); return; }
        if (id === "readinessModal") {
          const current = state.readiness[localISO()];
          const form = $("#readinessForm");
          form.reset();
          if (current) Object.entries(current).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value; });
        }
        document.getElementById(id)?.showModal();
      }
      const planButton = event.target.closest("[data-plan-index]"); if (planButton) { selectedPlan = Number(planButton.dataset.planIndex); renderPlan(); }
      const substituteButton = event.target.closest("[data-substitute-session]");
      if (substituteButton) { const session = adaptivePlan.find(item => item.id === substituteButton.dataset.substituteSession); if (session) openSubstitution(session); }
      const missButton = event.target.closest("[data-miss-session]");
      if (missButton) { substitutionSessionId = missButton.dataset.missSession; saveTrainingDecision("missed"); }
      const replacementButton = event.target.closest("[data-replacement-id]");
      if (replacementButton) saveTrainingDecision("substituted", replacementButton.dataset.replacementId);
      const nutritionAction = event.target.closest("[data-nutrition-action]");
      if (nutritionAction) saveNutritionInteraction({ date: nutritionAction.dataset.nutritionDate, slot: nutritionAction.dataset.nutritionSlot, mealId: nutritionAction.dataset.mealId, action: nutritionAction.dataset.nutritionAction });
      const nutritionSwap = event.target.closest("[data-nutrition-swap]");
      if (nutritionSwap) swapNutritionOption(nutritionSwap.dataset.nutritionDate, nutritionSwap.dataset.nutritionSwap);
      const raceCard = event.target.closest("[data-race-history]"); if (raceCard) { selectedRaceHistory = raceCard.dataset.raceHistory; renderRaceHistory(); }
      const editButton = event.target.closest("[data-edit-workout]");
      if (editButton) { const workout = state.workouts.find(item => item.id === editButton.dataset.editWorkout); if (workout) openWorkoutForm(workout); }
      const deleteButton = event.target.closest("[data-delete-workout]");
      if (deleteButton) {
        const index = state.workouts.findIndex(item => item.id === deleteButton.dataset.deleteWorkout);
        if (index >= 0) {
          lastDeletedWorkout = { workout: state.workouts[index], index };
          state.workouts.splice(index, 1);
          saveState();
          renderAll();
          showToast("Treino excluído e plano recalculado.", { label: "Desfazer", run: () => { if (!lastDeletedWorkout) return; state.workouts.splice(lastDeletedWorkout.index, 0, lastDeletedWorkout.workout); lastDeletedWorkout = null; saveState("Exclusão desfeita."); renderAll(); } });
        }
      }
      const closeButton = event.target.closest("[data-close]"); if (closeButton) closeButton.closest("dialog")?.close();
    });

    $("#menuButton").addEventListener("click", event => { const open = $("#sidebar").classList.toggle("open"); event.currentTarget.setAttribute("aria-expanded", String(open)); });
    $("#mobileMore").addEventListener("click", () => $("#sidebar").classList.add("open"));
    $("#openProfile").addEventListener("click", openProfileModal); $("#settingsProfile").addEventListener("click", openProfileModal);
    $("#choosePhoto").addEventListener("click", () => $("#profilePhotoInput").click()); $("#changePhoto").addEventListener("click", () => $("#profilePhotoInput").click());
    $("#profilePhotoInput").addEventListener("change", event => handlePhoto(event.target.files[0])); $("#profileNameInput").addEventListener("input", event => applyAvatar(pendingPhoto, event.target.value)); $("#removePhoto").addEventListener("click", () => { pendingPhoto = null; applyAvatar(null, $("#profileNameInput").value); });
    $("#historySearch").addEventListener("input", renderHistory); $("#historyType").addEventListener("change", renderHistory); $("#historyPeriod").addEventListener("change", renderHistory); $("#raceHistorySelect").addEventListener("change", event => { selectedRaceHistory = event.target.value; renderRaceHistory(); });
    $("#settingsPreferences").addEventListener("click", openPreferences);
    $("#themeToggle").addEventListener("click", () => { state.settings.theme = resolvedTheme() === "dark" ? "light" : "dark"; saveState(); renderPreferences(); });
    $("#editRaceButton").addEventListener("click", () => openRaceForm(true));
    $("#cancelRaceButton").addEventListener("click", () => { const race = activeRace(); if (race && window.confirm(`Cancelar ${race.name}? O histórico de provas concluídas será mantido.`)) { state.races = state.races.filter(item => item.id !== race.id); saveState("Prova cancelada. O plano voltou ao modo contínuo."); renderAll(); } });

    $("#profileForm").addEventListener("submit", async event => {
      event.preventDefault(); const name = $("#profileNameInput").value.trim(); if (!name) { showToast("Digite seu nome."); return; }
      const submit = event.currentTarget.querySelector('button[type="submit"]'); submit.disabled = true; submit.textContent = "Salvando…";
      try { const previousPhoto = state.profile.photo; if (cloudUser && pendingPhoto?.startsWith("data:image/")) pendingPhoto = await uploadProfilePhoto(cloudUser.uid, pendingPhoto); else if (cloudUser && !pendingPhoto && previousPhoto) await removeCloudProfilePhoto(cloudUser.uid); state.profile = { name: name.slice(0, 40), photo: pendingPhoto }; saveState("Perfil atualizado."); $("#profileModal").close(); renderAll(); }
      catch (error) { showToast(friendlyFirebaseError(error)); }
      finally { submit.disabled = false; submit.textContent = "Salvar perfil"; }
    });

    $("#workoutForm").addEventListener("submit", event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); const id = String(form.get("workoutId") || ""); const durationSeconds = parseDuration(form.get("duration")); const distance = Number(form.get("distance"));
      if (!(distance > 0) || !(durationSeconds > 0)) { showToast("Confira a distância e a duração."); return; }
      const workout = normalizeWorkout({ id: id || uid(), date: form.get("date"), distance, durationSeconds, rpe: form.get("rpe"), type: form.get("type"), feeling: form.get("feeling"), stitch: form.get("stitch"), shoe: form.get("shoe"), notes: form.get("notes") });
      if (id) state.workouts = state.workouts.map(item => item.id === id ? workout : item); else state.workouts.push(workout);
      saveState(id ? "Treino atualizado e plano recalculado." : "Treino salvo. Plano e alimentação atualizados."); event.currentTarget.reset(); $("#workoutModal").close(); selectedPlan = 0; renderAll();
    });

    $("#nextRaceForm").addEventListener("submit", event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); const id = String(form.get("raceId") || ""); const goalSeconds = form.get("goalTime") ? parseDuration(form.get("goalTime")) : null;
      if (form.get("goalTime") && !goalSeconds) { showToast("Confira a meta de tempo."); return; }
      const existing = state.races.find(race => race.id === id);
      const race = normalizeRace({ id: id || uid(), name: form.get("name"), date: form.get("date"), distance: Number(form.get("distance")), location: form.get("location"), goalSeconds, createdAt: existing?.createdAt || localISO(), status: "planned" });
      if (existing) state.races = state.races.map(item => item.id === id ? race : item); else state.races.push(race);
      saveState(existing ? "Prova atualizada e ciclo recalculado." : "Prova adicionada. Seu ciclo adaptativo começou."); $("#nextRaceModal").close(); selectedPlan = 0; renderAll();
    });

    $("#raceResultForm").addEventListener("submit", event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); const race = state.races.find(item => item.id === form.get("raceId")); const officialSeconds = parseDuration(form.get("officialTime"));
      if (!race || !officialSeconds) { showToast("Confira o tempo oficial."); return; }
      const splitValues = String(form.get("splits") || "").split(",").map(value => value.trim()).filter(Boolean); const splits = splitValues.map(parseDuration);
      if (splits.some(value => !value)) { showToast("Confira as parciais. Use valores como 5:30, 5:28, 5:25."); return; }
      race.status = "completed"; race.result = { officialSeconds, distance: Number(form.get("distance")), placement: form.get("placement") ? Number(form.get("placement")) : null, bib: String(form.get("bib") || ""), feeling: String(form.get("feeling") || ""), weather: String(form.get("weather") || ""), splits, shoe: String(form.get("shoe") || ""), notes: String(form.get("notes") || "") };
      selectedRaceHistory = race.id; saveState("Resultado oficial salvo no histórico de provas."); $("#raceResultModal").close(); renderAll(); navigate("historico");
    });

    $("#shoeForm").addEventListener("submit", event => { event.preventDefault(); const form = new FormData(event.currentTarget); state.equipment.push(normalizeEquipment({ id: uid(), name: form.get("name"), type: form.get("type"), lifespan: form.get("lifespan"), totalKm: 0, planned: false })); saveState("Tênis adicionado à rotação."); event.currentTarget.reset(); $("#shoeModal").close(); renderEquipment(); });
    $("#weightForm").addEventListener("submit", event => { event.preventDefault(); const weight = Number($("#weightInput").value); if (weight < 30 || weight > 250) { showToast("Digite um peso entre 30 e 250 kg."); return; } state.weights.push({ id: uid(), date: localISO(), weight }); saveState("Peso registrado. Alimentação atualizada."); renderAll(); });

    $("#readinessForm").addEventListener("submit", event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      state.readiness[localISO()] = normalizeReadiness(Object.fromEntries(form));
      saveState("Check-in salvo. A recomendação de hoje foi atualizada.");
      $("#readinessModal").close();
      renderAll();
    });

    $("#preferencesForm [name=adaptiveGoal]").addEventListener("change", event => { $("#preferencesForm [name=weeklyGoal]").disabled = event.target.checked; });
    $("#preferencesForm").addEventListener("submit", event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      state.settings.adaptiveGoal = form.get("adaptiveGoal") === "on";
      state.settings.weeklyGoal = clamp(Number(form.get("weeklyGoal")) || 10, 3, 200);
      state.settings.theme = ["system", "dark", "light"].includes(form.get("theme")) ? form.get("theme") : "system";
      saveState("Preferências atualizadas.");
      $("#preferencesModal").close();
      renderAll();
    });

    $("#onboardingHasRace").addEventListener("change", event => { $("#onboardingRaceFields").hidden = !event.target.checked; });
    $("#markWorkoutMissed").addEventListener("click", () => saveTrainingDecision("missed"));
    $("#onboardingBack").addEventListener("click", () => {
      state.onboarding.currentStep = Math.max(0, onboardingStep(state) - 1);
      saveState(); renderOnboarding();
    });
    $("#onboardingSaveExit").addEventListener("click", async () => {
      saveState();
      $("#onboardingModal").close();
      await signOutCloud();
    });
    $("#onboardingForm").addEventListener("submit", event => {
      event.preventDefault();
      const step = ONBOARDING_STEPS[onboardingStep(state)];
      if (step.id === "finish") {
        state = completeOnboarding(state);
        saveState("Perfil inicial concluído. Bem-vindo ao MyPace.");
        $("#onboardingModal").close();
        selectedPlan = 0; renderAll();
        return;
      }
      const values = onboardingFormValues();
      const error = validateOnboardingStep(step.id, values);
      if (error) { $("#onboardingMessage").textContent = error; return; }
      state = applyOnboardingStep(state, step.id, values);
      saveState(); renderAll(); renderOnboarding();
    });

    $$(".checklist input[data-check-item]").forEach(input => input.addEventListener("change", event => {
      const race = activeRace(); if (!race) return;
      state.raceChecklist[race.id] ||= {};
      state.raceChecklist[race.id][event.target.dataset.checkItem] = event.target.checked;
      saveState();
    }));

    $("#exportData").addEventListener("click", () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `pace-backup-${localISO()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); showToast("Backup exportado."); });
    $("#importData").addEventListener("change", event => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const imported = normalizeState(JSON.parse(reader.result)); if (!window.confirm("Importar este backup e substituir os dados atuais?")) return; state = imported; saveState("Backup importado. Experiência recalculada."); selectedPlan = 0; renderAll(); } catch (_) { showToast("Esse arquivo não é um backup válido do Pace."); } finally { event.target.value = ""; } }; reader.readAsText(file); });

    $("#cloudAccount").addEventListener("click", () => cloudUser ? navigate("configuracoes") : openCloudLogin()); $("#cloudAction").addEventListener("click", openCloudLogin); $("#cloudSignOut").addEventListener("click", async () => { await signOutCloud(); showToast("Conta desconectada. Os dados locais foram mantidos."); });
    $("#authGoogle").addEventListener("click", async event => {
      const button = event.currentTarget;
      setAuthMessage(); button.disabled = true; button.textContent = "Conectando…";
      try { await signInWithGoogle(); }
      catch (error) { setAuthMessage(friendlyFirebaseError(error)); }
      finally { button.disabled = false; button.textContent = "Continuar com Google"; }
    });
    $("#authLoginForm").addEventListener("submit", event => {
      event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
      runAuthAction(form, async () => { await signInCloud(String(data.get("email")).trim(), String(data.get("password"))); form.reset(); }, "Entrando…");
    });
    $("#authSignupForm").addEventListener("submit", event => {
      event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
      const password = String(data.get("password"));
      if (password !== String(data.get("confirmPassword"))) { setAuthMessage("As senhas não coincidem."); return; }
      pendingAccountName = String(data.get("name") || "").trim().slice(0, 40);
      runAuthAction(form, async () => { await createCloudAccount(String(data.get("email")).trim(), password, pendingAccountName); form.reset(); }, "Criando conta…");
    });
    $("#authResetForm").addEventListener("submit", event => {
      event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
      runAuthAction(form, async () => {
        await sendCloudPasswordReset(String(data.get("email")).trim());
        setAuthMessage("Link enviado. Confira também a caixa de spam.", true);
      }, "Enviando…");
    });

    $$("dialog").forEach(dialog => {
      dialog.addEventListener("click", event => { if (event.target === dialog && dialog.id !== "onboardingModal") dialog.close(); });
      dialog.addEventListener("cancel", event => { if (dialog.id === "onboardingModal" && !state.onboarding.completed) event.preventDefault(); });
      dialog.addEventListener("close", () => { if (dialog.id === "profileModal") renderAll(); });
    });
  }

  setupEnhancements();
  bindEvents();
  $("#workoutForm [name=date]").value = localISO();
  renderAll();
  startCloud();
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (state.settings.theme === "system") applyTheme(); });
})();
