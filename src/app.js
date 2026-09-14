import {
  APARTMENT_ID,
  RESIDENT_IDS,
  calculateBalances,
  calculateShares,
  completeRotatingTask,
  convertToEur,
  createInitialState,
  entityId,
  expenseCsv,
  filterExpensesByPeriod,
  normalizeState,
  resolveMergeConflicts,
  roundMoney,
  suggestSettlements,
  threeWayMerge,
} from "./core.js";
import { fetchJsonWithTimeout } from "./network.js";
import { reconcileAck } from "./sync-core.js";
import { registerPwa } from "./pwa.js";

// This is Supabase's public browser key, intentionally shipped to clients.
// Reads and writes go through code-checking RPCs; table reads are denied.
const SUPABASE_URL = "https://pitmfpsfaekexqqdhizm.supabase.co";
const SUPABASE_KEY = "sb_publishable_1Lh7Q6BiFuR6Hy-3rumzVw_8yW_XN0k";
const RATE_URL = "https://api.frankfurter.dev/v2/rate/EUR/BRL?providers=BCB";
const RATE_SOURCE = "Frankfurter · Banco Central do Brasil (PTAX)";

const useLocalDemo = ["localhost", "127.0.0.1"].includes(location.hostname)
  && new URLSearchParams(location.search).has("demo");
const storagePrefix = useLocalDemo ? "tricount-brazil-demo-" : "tricount-brazil-";
const CACHE_KEY = `${storagePrefix}state-v3`;
const BASE_KEY = `${storagePrefix}sync-base-v3`;
const VERSION_KEY = `${storagePrefix}remote-version-v1`;
const PENDING_KEY = `${storagePrefix}pending-v3`;
const GROUP_CODE_KEY = `${storagePrefix}group-code-v1`;
const CODE_VERIFIED_KEY = `${storagePrefix}code-verified-v1`;
const RATE_CACHE_KEY = "tricount-brazil-rate-eur-brl-v1";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value = "") =>
  String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);

const parse = (value, fallback = null) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const isoNow = () => new Date().toISOString();
const todayIso = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const euro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});
const real = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});
const compactNumber = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" });
const fullDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function displayDate(value) {
  if (!value) return "Date inconnue";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? "Date inconnue" : dateFormatter.format(date);
}

function displayFullDate(value) {
  if (!value) return "Date inconnue";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? "Date inconnue" : fullDateFormatter.format(date);
}

function relativeTime(value) {
  if (!value) return "";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "hier" : `il y a ${days} j`;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function isSafeReceipt(value) {
  return typeof value === "string" && /^data:image\/(jpeg|png|webp);base64,/i.test(value);
}

function demoState() {
  const demo = createInitialState("2026-08-29T09:00:00.000Z");
  const rate = 6.0315;
  const add = (id, title, payerId, amountOriginal, category, date, participantIds = RESIDENT_IDS) => {
    const { amountEur } = convertToEur({ amountOriginal, currency: "BRL", exchangeRate: rate });
    demo.expenses.push({
      id,
      spaceId: APARTMENT_ID,
      title,
      payerId,
      participantIds,
      amountOriginal,
      currency: "BRL",
      amountEur,
      exchangeRate: rate,
      exchangeRateDate: "2026-08-28",
      exchangeRateSource: RATE_SOURCE,
      conversionMode: "reference",
      category,
      splitMode: "equal",
      shares: calculateShares({ amountEur, participantIds }),
      date,
      note: "",
      createdAt: `${date}T12:00:00.000Z`,
      updatedAt: `${date}T12:00:00.000Z`,
    });
  };
  add("demo-1", "Courses Condor", "gaspard", 286.4, "Courses", "2026-08-29");
  add("demo-2", "Uber depuis l’aéroport", "raphael", 94.5, "Transport", "2026-08-28");
  add("demo-3", "Produits pour l’appartement", "gaspard", 132.9, "Appartement", "2026-08-27");
  add("demo-4", "Dîner quartier Batel", "raphael", 218, "Restaurant", "2026-08-26");
  demo.shoppingItems.push(
    { id: "demo-coffee", label: "Café", quantity: "2 paquets", category: "Épicerie", assigneeId: "gaspard", favorite: true, createdAt: isoNow(), updatedAt: isoNow() },
    { id: "demo-laundry", label: "Lessive", quantity: "1", category: "Ménage", assigneeId: "raphael", favorite: true, createdAt: isoNow(), updatedAt: isoNow() },
    { id: "demo-fruit", label: "Bananes", quantity: "6", category: "Fruits et légumes", createdAt: isoNow(), updatedAt: isoNow() },
  );
  demo.purchaseIdeas.push({
    id: "demo-washer",
    title: "Étendoir à linge",
    status: "compare",
    targetPrice: 180,
    currency: "BRL",
    opinion: "discuss",
    note: "Comparer la taille pliée.",
    link: "",
    createdAt: isoNow(),
    updatedAt: isoNow(),
  });
  return demo;
}

let state = normalizeState(
  parse(localStorage.getItem(CACHE_KEY)) || (useLocalDemo ? demoState() : createInitialState()),
);
let baseState = normalizeState(parse(localStorage.getItem(BASE_KEY)) || createInitialState());
let remoteVersion = Number(localStorage.getItem(VERSION_KEY)) || 0;
let currentView = "accounts";
let currentSpaceId = APARTMENT_ID;
let listTab = "shopping";
let groupTab = "expenses";
let expenseFilter = "all";
let expenseExpanded = false;
let isSaving = false;
let syncPromise = null;
let syncTimer = null;
let syncFailures = 0;
let lastSyncAt = 0;
let ratePromise = null;
let mutationRevision = 0;
let appUnlocked = false;
let currentRate = parse(localStorage.getItem(RATE_CACHE_KEY));

const appShell = $("#app-shell");
const accessGate = $("#access-gate");
const accessForm = $("#access-form");
const accessCodeInput = $("#access-code");
const accessError = $("#access-error");
const accessStatus = $("#access-status");
const root = $("#view-root");
const actionDialog = $("#action-dialog");
const formDialog = $("#form-dialog");
const formContent = $("#form-dialog-content");
const searchDialog = $("#search-dialog");
const settingsDialog = $("#settings-dialog");
const helpDialog = $("#help-dialog");

function memberById(id) {
  return state.members.find((member) => member.id === id) || {
    id,
    name: id || "Inconnu",
    initial: String(id || "?").slice(0, 1).toUpperCase(),
    type: "guest",
    color: "guest",
  };
}

function spaceById(id) {
  return state.spaces.find((space) => space.id === id) || state.spaces[0];
}

function avatar(memberOrId, className = "") {
  const person = typeof memberOrId === "string" ? memberById(memberOrId) : memberOrId;
  const color = person.color || (person.id === "gaspard" ? "yellow" : person.id === "raphael" ? "blue" : "guest");
  return `<span class="avatar avatar-${esc(color)} ${className}" aria-label="${esc(person.name)}">${esc(person.initial || person.name?.slice(0, 1) || "?")}</span>`;
}

function spaceMembers(spaceId = currentSpaceId) {
  return (spaceById(spaceId)?.memberIds || RESIDENT_IDS).map(memberById);
}

function setSync(tone, message) {
  document.body.dataset.sync = tone;
  $("#sync-label").textContent = message;
  $("#sync-pill-label").textContent = message;
}

function toast(message, tone = "success", action = null) {
  const node = document.createElement("div");
  node.className = `toast ${tone === "error" ? "is-error" : ""}`;
  node.innerHTML = `<i class="ph ${tone === "error" ? "ph-warning-circle" : "ph-check-circle"}" aria-hidden="true"></i><span>${esc(message)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ""}`;
  if (action) node.querySelector("button").addEventListener("click", () => { action.run(); node.remove(); });
  $("#toast-region").append(node);
  setTimeout(() => node.remove(), 4200);
}

function closeDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function showDialog(dialog) {
  $$('dialog[open]').forEach((open) => {
    if (open !== dialog) open.close();
  });
  if (!dialog.open) dialog.showModal();
}

function cacheState() {
  localStorage.setItem(CACHE_KEY, JSON.stringify(state));
}

function markPending() {
  const existing = parse(localStorage.getItem(PENDING_KEY));
  const pending = existing || {
    baseState,
    baseVersion: remoteVersion,
    createdAt: isoNow(),
  };
  pending.localState = state;
  pending.updatedAt = isoNow();
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  cacheState();
}

function persistSynced(nextState, version) {
  state = normalizeState(nextState);
  baseState = structuredClone(state);
  remoteVersion = Number(version) || remoteVersion;
  localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  localStorage.setItem(BASE_KEY, JSON.stringify(baseState));
  localStorage.setItem(VERSION_KEY, String(remoteVersion));
  localStorage.removeItem(PENDING_KEY);
}

function addActivity(type, text, entityType = "", entityIdValue = "", snapshot = null, actorId = "") {
  state.activity.unshift({
    id: entityId("activity"),
    type,
    text,
    entityType,
    entityId: entityIdValue,
    snapshot,
    actorId,
    at: isoNow(),
  });
  state.activity = state.activity.slice(0, 300);
}

async function ensureEditAccess() {
  if (appUnlocked && localStorage.getItem(GROUP_CODE_KEY)) return true;
  lockApp("Entre le code commun pour continuer.");
  return false;
}

async function mutate(actorId, eventType, change) {
  if (!(await ensureEditAccess())) return false;
  const before = structuredClone(state);
  try {
    change(state);
    state.updatedAt = isoNow();
    state.updatedBy = memberById(actorId)?.name || actorId || "Appartement";
    markPending();
    mutationRevision += 1;
  } catch (error) {
    state = before;
    toast(error.name === "QuotaExceededError" ? "Le stockage de cet appareil est plein. Exporte une sauvegarde avant de continuer." : error.message, "error");
    return false;
  }
  setSync(navigator.onLine ? "saving" : "offline", navigator.onLine ? "En attente…" : "Hors ligne");
  render();
  void syncPending(eventType, actorId);
  return true;
}

function requestHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra,
  };
}

function setAccessBusy(busy, message = "") {
  const button = accessForm?.querySelector("button[type='submit']");
  if (button) {
    button.disabled = busy;
    button.querySelector("span").textContent = busy ? "Vérification…" : "Ouvrir l’espace";
  }
  if (accessCodeInput) accessCodeInput.disabled = busy;
  if (message && accessStatus) accessStatus.textContent = message;
}

function lockApp(message = "Le code restera mémorisé uniquement sur cet appareil.", { clearCode = false } = {}) {
  appUnlocked = false;
  clearTimeout(syncTimer);
  if (clearCode) {
    localStorage.removeItem(GROUP_CODE_KEY);
    localStorage.removeItem(CODE_VERIFIED_KEY);
  }
  $$('dialog[open]').forEach((dialog) => dialog.close());
  document.body.classList.add("access-locked");
  appShell.hidden = true;
  accessGate.hidden = false;
  accessError.hidden = true;
  accessStatus.textContent = message;
  setAccessBusy(false);
  accessCodeInput.value = "";
  setTimeout(() => accessCodeInput.focus(), 80);
}

async function verifyAccessCode(code) {
  if (useLocalDemo) return { state, version: remoteVersion };
  const row = await fetchJsonWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/bootstrap_brazil_trip`, {
    method: "POST",
    headers: requestHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
    body: JSON.stringify({ p_access_code: code }),
    cache: "no-store",
  }, { timeoutMs: 5000 });
  return checkRpcResult(row);
}

function checkRpcResult(result) {
  if (result?.error) {
    const error = new Error(result.error === "RATE_LIMITED"
      ? `Trop de tentatives. Réessaie dans ${result.retry_after_seconds || 60} secondes.`
      : result.error === "INVALID_ACCESS_CODE" ? "Ce code n’est pas le bon."
        : result.error === "CONFLICT_VERSION" ? "Les comptes ont évolué. Nouvelle synchronisation…"
          : "Le carnet partagé est momentanément indisponible.");
    error.code = result.error;
    throw error;
  }
  const row = Array.isArray(result) ? result[0] : result;
  if (!row?.state || !Number.isFinite(Number(row.version))) throw new Error("Réponse du carnet invalide.");
  return row;
}

function unlockApp(code, { offline = false, row = null } = {}) {
  appUnlocked = true;
  localStorage.setItem(GROUP_CODE_KEY, code);
  localStorage.setItem(CODE_VERIFIED_KEY, "server-v1");
  document.body.classList.remove("access-locked");
  accessGate.hidden = true;
  appShell.hidden = false;
  parseHash();
  if (row && !localStorage.getItem(PENDING_KEY)) persistSynced(row.state, row.version);
  render();
  performance.mark("app-usable");
  if (useLocalDemo) { setSync("live", "Démo locale"); return; }
  setSync(offline ? "offline" : "live", offline ? "Copie locale" : "À jour");
  if (!row || localStorage.getItem(PENDING_KEY)) void syncPending("Ouverture", state.updatedBy);
  else scheduleSync();
  setTimeout(() => { void getLatestRate(); }, 1500);
}

async function bootstrapAccess() {
  if (useLocalDemo) { unlockApp("demo"); return; }
  const storedCode = localStorage.getItem(GROUP_CODE_KEY) || "";
  if (/^\d{4}$/.test(storedCode) && localStorage.getItem(CODE_VERIFIED_KEY) === "server-v1") {
    unlockApp(storedCode, { offline: true });
    return;
  }
  lockApp();
  if (!/^\d{4}$/.test(storedCode)) return;
  setAccessBusy(true, "Vérification de cet appareil…");
  try {
    const row = await verifyAccessCode(storedCode);
    unlockApp(storedCode, { row });
  } catch (error) {
    lockApp(error.code === "INVALID_ACCESS_CODE" ? "Le code enregistré n’est plus valide." : "Une connexion est nécessaire pour vérifier le code la première fois.", { clearCode: error.code === "INVALID_ACCESS_CODE" });
  }
}

async function fetchRemoteRow() {
  return verifyAccessCode(localStorage.getItem(GROUP_CODE_KEY));
}

function conflictTitle(conflict) {
  const value = conflict.local || conflict.remote || conflict.base || {};
  return value.title || value.label || value.name || value.text || conflict.id;
}

function resolveConflictDialog(merged, conflicts) {
  formContent.innerHTML = `
    <header class="dialog-header">
      <div><p>MODIFICATIONS SIMULTANÉES</p><h2 id="form-dialog-title">${conflicts.length} conflit${conflicts.length > 1 ? "s" : ""} à choisir</h2></div>
    </header>
    <form id="conflict-form">
      <div class="sheet-body">
        <p class="sheet-intro">Les changements faits sur des lignes différentes ont déjà été fusionnés. Choisis seulement la version à garder pour les lignes modifiées des deux côtés.</p>
        <div class="conflict-list">
          ${conflicts.map((conflict, index) => `
            <article class="conflict-card">
              <h3>${esc(conflictTitle(conflict))}</h3>
              <p>Cette ligne a changé sur cet appareil et dans la version partagée.</p>
              <div class="segmented-control">
                <label class="choice-chip"><input class="sr-only" type="radio" name="conflict-${index}" value="local" /> Ma version</label>
                <label class="choice-chip is-active"><input class="sr-only" type="radio" name="conflict-${index}" value="remote" checked /> Version partagée</label>
              </div>
            </article>`).join("")}
        </div>
      </div>
      <div class="form-actions"><button class="primary-button" type="submit">Fusionner et synchroniser</button></div>
    </form>`;
  showDialog(formDialog);
  $$(".choice-chip", formContent).forEach((label) => {
    label.addEventListener("click", () => {
      $$(`input[name="${label.querySelector("input").name}"]`, formContent)
        .forEach((input) => input.closest("label").classList.toggle("is-active", input === label.querySelector("input")));
    });
  });
  return new Promise((resolve) => {
    const onClose = () => resolve(null);
    formDialog.addEventListener("close", onClose, { once: true });
    $("#conflict-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const choices = {};
      conflicts.forEach((conflict, index) => {
        choices[`${conflict.key}:${conflict.id}`] = $(`input[name="conflict-${index}"]:checked`, formContent)?.value || "remote";
      });
      formDialog.removeEventListener("close", onClose);
      closeDialog(formDialog);
      resolve(resolveMergeConflicts(merged, conflicts, choices));
    });
  });
}

function scheduleSync(delay) {
  clearTimeout(syncTimer);
  if (!appUnlocked || useLocalDemo || !navigator.onLine || document.visibilityState !== "visible") return;
  const pending = Boolean(localStorage.getItem(PENDING_KEY));
  const interval = delay ?? (syncFailures ? Math.min(60_000, 2000 * 2 ** Math.min(syncFailures, 5)) : pending ? 400 : 30_000);
  syncTimer = setTimeout(() => { void syncPending(); }, interval);
}

function syncPending(eventType = "Synchronisation", actorId = "") {
  if (!appUnlocked) return Promise.resolve();
  if (useLocalDemo) { cacheState(); setSync("live", "Démo locale"); return Promise.resolve(); }
  if (syncPromise) return syncPromise;
  if (!navigator.onLine) {
    setSync("offline", "Hors ligne");
    return Promise.resolve();
  }
  clearTimeout(syncTimer);
  syncPromise = performSync(eventType, actorId).finally(() => {
    isSaving = false;
    syncPromise = null;
    scheduleSync();
  });
  return syncPromise;
}

async function performSync(eventType, actorId) {
  isSaving = true;
  if (localStorage.getItem(PENDING_KEY)) setSync("saving", "À envoyer…");
  try {
    const remoteRow = await fetchRemoteRow();
    if (!appUnlocked) return;
    if (!remoteRow) {
      setSync("error", "Configuration en attente");
      return;
    }
    const pending = parse(localStorage.getItem(PENDING_KEY));
    const remote = normalizeState(remoteRow.state);
    if (!pending) {
      if (Number(remoteRow.version) > remoteVersion || !localStorage.getItem(BASE_KEY)) {
        persistSynced(remote, remoteRow.version);
        render();
      }
      setSync("live", "Synchronisé");
      syncFailures = 0;
      lastSyncAt = Date.now();
      return;
    }

    if (!localStorage.getItem(GROUP_CODE_KEY)) {
      setSync("error", "Code requis");
      return;
    }

    if (Number(pending.baseVersion) !== Number(remoteRow.version)) {
      const merged = threeWayMerge(pending.baseState, state, remote);
      const reconciled = merged.conflicts.length
        ? await resolveConflictDialog(merged.state, merged.conflicts)
        : merged.state;
      if (!reconciled) { setSync("error", "Choix à confirmer"); syncFailures += 1; return; }
      state = reconciled;
      localStorage.setItem(PENDING_KEY, JSON.stringify({
        baseState: remote,
        baseVersion: Number(remoteRow.version),
        localState: state,
        createdAt: pending.createdAt,
        updatedAt: isoNow(),
      }));
      cacheState();
    }

    const latestPending = parse(localStorage.getItem(PENDING_KEY));
    const expectedVersion = Number(latestPending?.baseVersion ?? remoteRow.version);
    const submitted = structuredClone(state);
    const submittedRevision = mutationRevision;
    const result = await fetchJsonWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/save_brazil_trip_state_secure`, {
      method: "POST",
      headers: requestHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({
        p_access_code: localStorage.getItem(GROUP_CODE_KEY),
        p_state: submitted,
        p_expected_version: expectedVersion,
        p_actor: memberById(actorId)?.name || state.updatedBy || "Appartement",
        p_event_type: eventType,
      }),
    }, { timeoutMs: 8000 });
    const row = checkRpcResult(result);
    if (submittedRevision === mutationRevision) persistSynced(row.state, row.version);
    else {
      const ack = reconcileAck(submitted, state, row.state);
      const local = ack.state;
      persistSynced(row.state, row.version);
      state = local;
      markPending();
    }
    syncFailures = 0;
    lastSyncAt = Date.now();
    setSync(localStorage.getItem(PENDING_KEY) ? "saving" : "live", localStorage.getItem(PENDING_KEY) ? "À envoyer…" : "À jour");
    render();
  } catch (error) {
    syncFailures += 1;
    if (error.code === "INVALID_ACCESS_CODE") {
      lockApp("Le code a été refusé. Tes modifications restent sur cet appareil.", { clearCode: true });
      return;
    }
    const offline = !navigator.onLine || error.code === "TIMEOUT" || /fetch|network/i.test(error.message);
    setSync(offline ? "offline" : "error", localStorage.getItem(PENDING_KEY) ? "À envoyer" : "Copie locale");
    if (!offline && syncFailures === 1 && error.code !== "CONFLICT_VERSION") toast(error.message || "Synchronisation impossible.", "error");
  }
}

async function getLatestRate({ force = false } = {}) {
  const cached = parse(localStorage.getItem(RATE_CACHE_KEY));
  const fresh = cached && Date.now() - Number(cached.fetchedAt) < 6 * 60 * 60 * 1000;
  if (!force && fresh) {
    currentRate = cached;
    return cached;
  }
  if (ratePromise) return ratePromise;
  ratePromise = (async () => { try {
    const data = await fetchJsonWithTimeout(RATE_URL, { cache: "no-store" }, { timeoutMs: 4000 });
    if (!(Number(data.rate) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(data.date || "")) {
      throw new Error("Réponse de taux invalide");
    }
    currentRate = {
      rate: Number(data.rate),
      date: data.date,
      source: RATE_SOURCE,
      fetchedAt: Date.now(),
    };
    localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(currentRate));
    return currentRate;
  } catch {
    currentRate = cached || null;
    return currentRate;
  } finally { ratePromise = null; } })();
  return ratePromise;
}

function categoryIcon(category = "Autre") {
  const normalized = category.toLowerCase();
  if (/course|épicerie/.test(normalized)) return ["basket", "courses"];
  if (/transport|uber|taxi/.test(normalized)) return ["car", "transport"];
  if (/restaurant/.test(normalized)) return ["fork-knife", "restaurant"];
  if (/sortie|bar/.test(normalized)) return ["martini", "sortie"];
  if (/appartement|logement/.test(normalized)) return ["house-line", "appartement"];
  if (/abonnement|internet/.test(normalized)) return ["wifi-high", "transport"];
  return ["receipt", "autre"];
}

function expenseOriginal(expense) {
  return expense.currency === "BRL"
    ? real.format(Number(expense.amountOriginal))
    : euro.format(Number(expense.amountOriginal));
}

function expenseRow(expense) {
  const payer = memberById(expense.payerId);
  const [icon, tone] = categoryIcon(expense.category);
  const attachments = [expense.note ? '<i class="ph ph-note" aria-label="Note jointe"></i>' : "", isSafeReceipt(expense.receiptDataUrl) ? '<i class="ph ph-camera" aria-label="Photo jointe"></i>' : ""].join("");
  return `
    <li class="data-row expense-ledger-row">
      <button class="row-open" type="button" data-expense-id="${esc(expense.id)}" aria-label="Ouvrir ${esc(expense.title)}">
        <time class="ledger-date" datetime="${esc(expense.date)}"><span>${displayDate(expense.date)}</span><small>${displayFullDate(expense.date)}</small></time>
        <span class="row-identity">
          <span class="category-icon category-${tone}"><i class="ph ph-${icon}" aria-hidden="true"></i></span>
          <span class="row-copy">
            <b>${esc(expense.title)}</b>
            <small>${esc(expense.category || "Autre")} <span class="mobile-expense-payer">· ${esc(payer.name)}</span> ${attachments}</small>
          </span>
        </span>
        <span class="ledger-payer">${avatar(payer)}<span>${esc(payer.name)}</span></span>
        <span class="ledger-original"><b>${expense.currency === "BRL" ? esc(real.format(Number(expense.amountOriginal))) : "—"}</b><small>montant saisi</small></span>
        <span class="ledger-eur"><b>${euro.format(Number(expense.amountEur))}</b><small>${expense.currency === "BRL" ? "valeur figée" : "saisi en euros"}</small></span>
        <i class="ph ph-caret-right ledger-caret" aria-hidden="true"></i>
      </button>
      <button class="row-menu" type="button" data-menu="expense" data-id="${esc(expense.id)}" aria-label="Actions pour ${esc(expense.title)}"><i class="ph ph-dots-three"></i></button>
    </li>`;
}

function emptyState(icon, title, copy, actionLabel = "", action = "") {
  return `<div class="empty-state"><div><i class="ph ph-${icon}" aria-hidden="true"></i><h3>${esc(title)}</h3><p>${esc(copy)}</p>${actionLabel ? `<button class="secondary-button" type="button" data-action="${esc(action)}">${esc(actionLabel)}</button>` : ""}</div></div>`;
}

function filteredSpaceExpenses(spaceId = currentSpaceId) {
  const expenses = state.expenses
    .filter((expense) => expense.spaceId === spaceId && !expense.deletedAt)
    .sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)));
  return filterExpensesByPeriod(expenses, expenseFilter, new Date());
}

function expenseFilters() {
  const options = [
    ["today", "Aujourd’hui"],
    ["yesterday", "Hier"],
    ["week", "Cette semaine"],
    ["month", "Ce mois-ci"],
    ["all", "Depuis le début"],
    ["month-08", "Août"],
    ["month-09", "Septembre"],
    ["month-10", "Octobre"],
    ["month-11", "Novembre"],
    ["month-12", "Décembre"],
  ];
  return `<label class="period-filter"><i class="ph ph-calendar-blank" aria-hidden="true"></i><span class="sr-only">Période des dépenses</span><select data-expense-filter-select aria-label="Période des dépenses">${options.map(([value, label]) => `<option value="${value}" ${expenseFilter === value ? "selected" : ""}>${label}</option>`).join("")}</select><i class="ph ph-caret-down" aria-hidden="true"></i></label>`;
}

function peopleBalanceList(spaceId) {
  const result = calculateBalances(state, spaceId);
  return spaceMembers(spaceId).map((person) => {
    const balance = result.balances[person.id] || 0;
    const status = balance > 0.005 ? ["À recevoir", "positive"] : balance < -0.005 ? ["À rembourser", "negative"] : ["À l’équilibre", "neutral"];
    return `<li><button class="person-row row-button" type="button" data-person-id="${esc(person.id)}" data-space-id="${esc(spaceId)}" aria-label="Bilan de ${esc(person.name)}">
      <span class="row-identity">${avatar(person)}<span class="row-copy"><b>${esc(person.name)}</b><small>Avancé ${euro.format(result.paid[person.id] || 0)} · part ${euro.format(result.owed[person.id] || 0)}</small></span></span>
      <span class="person-balance"><b class="${status[1]}">${euro.format(Math.abs(balance))}</b><small>${status[0]}</small></span>
    </button></li>`;
  }).join("");
}

function primarySettlement(spaceId) {
  const { balances } = calculateBalances(state, spaceId);
  const suggestions = suggestSettlements(balances);
  if (!suggestions.length) {
    return `<div class="all-settled"><div><i class="ph ph-check-circle" aria-hidden="true"></i><b>Tout est réglé.</b><p>Le prochain achat repartira d’un solde parfaitement net.</p></div></div>`;
  }
  const move = suggestions[0];
  const from = memberById(move.fromId);
  const to = memberById(move.toId);
  const extra = suggestions.length > 1 ? `<p class="settlement-note">+ ${suggestions.length - 1} autre${suggestions.length > 2 ? "s" : ""} virement${suggestions.length > 2 ? "s" : ""} conseillé${suggestions.length > 2 ? "s" : ""}</p>` : "";
  return `<div class="settlement-card">
    <div class="settlement-route">${avatar(from)}<b>${esc(from.name)}</b><i class="ph ph-arrow-right"></i>${avatar(to)}<b>${esc(to.name)}</b></div>
    <div class="settlement-amount">${euro.format(move.amountEur)}</div>
    <p class="settlement-note">Virement conseillé en euros</p>${extra}
    <button class="settlement-button" type="button" data-settle-space="${esc(spaceId)}" data-from="${esc(move.fromId)}" data-to="${esc(move.toId)}" data-amount="${move.amountEur}"><i class="ph ph-check"></i> Marquer réglé</button>
  </div>`;
}

function categoryChart(spaceId) {
  const totals = new Map();
  state.expenses.filter((expense) => expense.spaceId === spaceId && !expense.deletedAt).forEach((expense) => {
    totals.set(expense.category || "Autre", roundMoney((totals.get(expense.category || "Autre") || 0) + Number(expense.amountEur)));
  });
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!rows.length) return `<p class="sheet-intro">Les tendances apparaîtront après les premières dépenses.</p>`;
  const max = rows[0][1] || 1;
  return `<div class="chart-list">${rows.map(([label, amount]) => `<div class="chart-row"><span>${esc(label)}</span><span class="chart-track"><i style="width:${Math.max(5, (amount / max) * 100)}%"></i></span><b>${euro.format(amount)}</b></div>`).join("")}</div>`;
}

function activityHistory(spaceId = "") {
  const relevant = state.activity.filter((entry) => {
    if (!spaceId) return true;
    if (entry.entityType === "expense") {
      const expense = state.expenses.find((item) => item.id === entry.entityId) || entry.snapshot;
      return expense?.spaceId === spaceId;
    }
    return entry.spaceId === spaceId || spaceId === APARTMENT_ID;
  }).slice(0, 20);
  if (!relevant.length) return `<p class="sheet-intro">Aucune activité pour le moment.</p>`;
  return `<ul class="activity-list">${relevant.map((entry) => `<li class="activity-row"><span class="row-copy"><b>${esc(entry.text)}</b><small>${relativeTime(entry.at)}</small></span>${entry.snapshot && entry.type === "expense-cancel" ? `<button class="history-restore" type="button" data-restore-expense="${esc(entry.entityId)}">Restaurer</button>` : `<time>${displayDate(entry.at)}</time>`}</li>`).join("")}</ul>`;
}

function recurringDue() {
  return state.recurringExpenses.filter((item) => !item.archived && item.nextDate && item.nextDate <= todayIso());
}

function renderAccounts() {
  if (currentSpaceId !== APARTMENT_ID) return renderGroupDetail();
  const result = calculateBalances(state, APARTMENT_ID);
  const gaspardBalance = result.balances.gaspard || 0;
  const balanceClass = gaspardBalance > 0.005 ? "is-positive" : gaspardBalance < -0.005 ? "is-negative" : "";
  const balanceCopy = gaspardBalance > 0.005
    ? `Raphael doit ${euro.format(gaspardBalance)} à Gaspard.`
    : gaspardBalance < -0.005
      ? `Gaspard doit ${euro.format(-gaspardBalance)} à Raphael.`
      : "Gaspard et Raphael sont à l’équilibre.";
  const expenses = filteredSpaceExpenses(APARTMENT_ID);
  const shown = expenseExpanded ? expenses : expenses.slice(0, 6);
  const groups = state.spaces.filter((space) => space.type === "group" && !space.archivedAt)
    .sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)));
  const due = recurringDue();
  const mainSettlement = suggestSettlements(result.balances)[0];

  root.innerHTML = `<div class="accounts-layout">
    <div class="accounts-main">
      <section class="balance-hero" aria-labelledby="balance-title">
        <div class="balance-topline"><span class="balance-context"><i class="ph ph-buildings"></i> Appartement</span><span class="balance-eyebrow">SOLDE ENTRE VOUS</span></div>
        <div class="balance-content"><div><h2 class="balance-value ${balanceClass}" id="balance-title">${euro.format(Math.abs(gaspardBalance))}</h2><p class="balance-copy">${balanceCopy}</p></div>${mainSettlement ? `<div class="hero-route" aria-label="${esc(memberById(mainSettlement.fromId).name)} rembourse ${esc(memberById(mainSettlement.toId).name)}">${avatar(mainSettlement.fromId)}<span>${esc(memberById(mainSettlement.fromId).name)}</span><i class="ph ph-arrow-right"></i>${avatar(mainSettlement.toId)}<span>${esc(memberById(mainSettlement.toId).name)}</span></div>` : `<div class="hero-route is-settled"><i class="ph ph-check-circle"></i><span>Tout est réglé</span></div>`}</div>
        <div class="metrics">
          <div class="metric"><span>TOTAL</span><b>${euro.format(result.totalEur)}</b></div>
          <div class="metric"><span>DÉPENSES</span><b>${result.expenseCount}</b></div>
          <div class="metric"><span>À RÉGLER</span><b>${suggestSettlements(result.balances).length}</b></div>
        </div>
      </section>

      ${due.length ? `<section class="recurrence-banner"><div><h3>${due.length} dépense${due.length > 1 ? "s" : ""} récurrente${due.length > 1 ? "s" : ""} à confirmer</h3><p>Rien n’est ajouté sans ta validation.</p></div><button class="secondary-button" type="button" data-review-recurrences>Vérifier</button></section>` : ""}

      <section class="section-block">
        <div class="section-head ledger-heading"><div><h2>Dépenses</h2><p>BRL d’origine, équivalent EUR figé.</p></div><div class="section-tools">${expenseFilters()}<button class="ledger-add-button" type="button" data-action="expense"><i class="ph ph-plus"></i><span>Dépense</span></button></div></div>
        ${shown.length ? `<div class="expense-table-header"><span>Date</span><span>Dépense</span><span>Payé par</span><span>Montant BRL</span><span>EUR figé</span><span></span></div><ul class="data-list expense-ledger">${shown.map(expenseRow).join("")}</ul>` : emptyState("receipt", "Aucune dépense ici", "Ajoute le premier achat en reais ou en euros.", "Ajouter une dépense", "expense")}
        ${expenses.length > 6 ? `<button class="load-more" type="button" data-toggle-expenses>${expenseExpanded ? "Réduire l’historique" : `Voir les ${expenses.length} dépenses`}</button>` : ""}
      </section>

      <section class="section-block">
        <div class="section-head"><div><h2>Groupes ponctuels</h2><p>Soirées et invités, séparés de l’Appartement.</p></div><button class="text-button" type="button" data-new-group>+ Nouveau groupe</button></div>
        ${groups.length ? `<ul class="group-list">${groups.map((space) => {
          const calculation = calculateBalances(state, space.id);
          return `<li><button class="group-row row-button" type="button" data-group-id="${esc(space.id)}" aria-label="Ouvrir le groupe ${esc(space.name)}"><span class="row-identity"><span class="row-icon"><i class="ph ph-users-three"></i></span><span class="row-copy"><b>${esc(space.name)}</b><small>${displayFullDate(space.date)} · ${space.memberIds?.length || 0} personnes · ${calculation.expenseCount} dépenses</small></span></span><span class="group-meta"><span class="group-status ${space.status === "closed" ? "is-closed" : "is-open"}">${space.status === "closed" ? "Clôturé" : "Ouvert"}</span><span class="row-amount"><b>${euro.format(calculation.totalEur)}</b></span><i class="ph ph-caret-right"></i></span></button></li>`;
        }).join("")}</ul>` : emptyState("users-three", "Aucun groupe ponctuel", "Crée une soirée quand des invités partagent des dépenses avec vous.", "Créer un groupe", "new-group")}
      </section>
    </div>

    <aside class="accounts-rail">
      <section class="rail-panel settlement-panel">
        <div class="section-head"><div><h2>Virement conseillé</h2><p>Le minimum nécessaire, en euros.</p></div></div>
        ${primarySettlement(APARTMENT_ID)}
      </section>
      <section class="rail-panel">
        <div class="section-head"><div><h2>Bilan individuel</h2><p>Avancé, part et solde.</p></div></div>
        <ul class="people-list">${peopleBalanceList(APARTMENT_ID)}</ul>
      </section>
      <section class="rail-panel">
        <div class="section-head"><div><h2>Par catégorie</h2><p>Tendance simple.</p></div></div>
        ${categoryChart(APARTMENT_ID)}
      </section>
      <section class="rail-panel">
        <details class="history-details"><summary>Activité récente <i class="ph ph-caret-down"></i></summary>${activityHistory(APARTMENT_ID)}</details>
      </section>
    </aside>
  </div>`;
}

function renderGroupDetail() {
  const space = spaceById(currentSpaceId);
  if (!space || space.type !== "group") {
    currentSpaceId = APARTMENT_ID;
    return renderAccounts();
  }
  const result = calculateBalances(state, space.id);
  const expenses = filteredSpaceExpenses(space.id);
  const shown = expenseExpanded ? expenses : expenses.slice(0, 8);
  const suggestions = suggestSettlements(result.balances);
  const members = spaceMembers(space.id);
  root.innerHTML = `<div class="group-detail-layout">
    <div>
      <button class="back-button" type="button" data-back-apartment><i class="ph ph-arrow-left"></i> Retour à l’Appartement</button>
      <section class="group-hero">
        <span class="group-status ${space.status === "closed" ? "is-closed" : "is-open"}">${space.status === "closed" ? "Clôturé" : "Ouvert"}</span>
        <h2>${esc(space.name)}</h2>
        <p>${displayFullDate(space.date)} · les invités restent uniquement dans ce groupe.</p>
        <div class="avatar-line">${members.map((person) => avatar(person)).join("")}</div>
        <div class="group-summary"><div class="metric"><span>TOTAL</span><b>${euro.format(result.totalEur)}</b></div><div class="metric"><span>DÉPENSES</span><b>${result.expenseCount}</b></div><div class="metric"><span>VIREMENTS</span><b>${suggestions.length}</b></div></div>
      </section>
      <div class="subnav-tabs"><button class="${groupTab === "expenses" ? "is-active" : ""}" type="button" data-group-tab="expenses">Dépenses</button><button class="${groupTab === "settlements" ? "is-active" : ""}" type="button" data-group-tab="settlements">Règlements</button><button class="${groupTab === "activity" ? "is-active" : ""}" type="button" data-group-tab="activity">Activité</button></div>
      ${groupTab === "expenses" ? `
        <div class="section-head"><div><h2>Dépenses du groupe</h2><p>Sous-groupes et deux devises acceptés.</p></div>${space.status !== "closed" ? `<button class="text-button" type="button" data-action="expense">+ Dépense</button>` : ""}</div>
        ${expenseFilters()}
        ${shown.length ? `<ul class="data-list">${shown.map(expenseRow).join("")}</ul>` : emptyState("receipt", "Aucune dépense", "Ajoute le premier achat partagé de ce groupe.", "Ajouter une dépense", "expense")}
        ${expenses.length > 8 ? `<button class="load-more" type="button" data-toggle-expenses>${expenseExpanded ? "Réduire" : `Voir les ${expenses.length} dépenses`}</button>` : ""}
      ` : groupTab === "settlements" ? `
        <div class="section-head"><div><h2>Règlements en euros</h2><p>${space.status === "closed" ? "Vérification clôturée." : "Prévisualisation avant clôture."}</p></div></div>
        ${suggestions.length ? `<ul class="settlement-list">${suggestions.map((move) => `<li class="settlement-row"><span class="row-identity">${avatar(move.fromId)}<span class="row-copy"><b>${esc(memberById(move.fromId).name)} → ${esc(memberById(move.toId).name)}</b><small>Virement conseillé</small></span></span><span class="row-actions"><b>${euro.format(move.amountEur)}</b><button class="mini-button" type="button" data-settle-space="${esc(space.id)}" data-from="${esc(move.fromId)}" data-to="${esc(move.toId)}" data-amount="${move.amountEur}">Réglé</button></span></li>`).join("")}</ul>` : `<div class="all-settled"><div><i class="ph ph-check-circle"></i><b>Tout est réglé.</b><p>Le groupe peut être archivé sereinement.</p></div></div>`}
      ` : activityHistory(space.id)}
    </div>
    <aside class="accounts-rail">
      <section class="rail-panel"><div class="section-head"><div><h2>Participants</h2><p>${members.length} personnes</p></div>${space.status !== "closed" ? `<button class="text-button" type="button" data-add-guest>+ Invité</button>` : ""}</div><ul class="people-list">${peopleBalanceList(space.id)}</ul></section>
      <section class="rail-panel"><div class="section-head"><div><h2>Prochain règlement</h2><p>En euros uniquement.</p></div></div>${primarySettlement(space.id)}</section>
      <section class="rail-panel"><div class="stack"><button class="secondary-button" type="button" data-copy-group-summary><i class="ph ph-copy"></i> Copier le résumé invité</button>${space.status === "closed" ? `<button class="quiet-button" type="button" data-reopen-group>Rouvrir le groupe</button>` : `<button class="primary-button" type="button" data-close-group>Vérifier et clôturer</button>`}</div></section>
    </aside>
  </div>`;
}

function shoppingSuggestions() {
  const recent = state.shoppingItems
    .filter((item) => item.checkedAt || item.favorite)
    .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map((item) => item.label);
  return [...new Set([...(state.preferences.favoriteShopping || []), ...recent])].slice(0, 8);
}

function categoryForItem(label) {
  const value = label.toLowerCase();
  if (/banane|pomme|tomate|fruit|légume|salade|oignon/.test(value)) return "Fruits et légumes";
  if (/lait|fromage|yaourt|œuf|oeuf|beurre/.test(value)) return "Frais";
  if (/lessive|éponge|poubelle|papier toilette|ménage/.test(value)) return "Ménage";
  if (/pharma|médicament|pansement/.test(value)) return "Pharmacie";
  if (/ampoule|outil|maison|appartement/.test(value)) return "Appartement";
  return "Épicerie";
}

function activeShoppingItems() {
  return state.shoppingItems.filter((item) => !item.deletedAt && !item.checkedAt);
}

function checkedShoppingItems() {
  return state.shoppingItems.filter((item) => !item.deletedAt && item.checkedAt)
    .sort((a, b) => String(b.checkedAt).localeCompare(String(a.checkedAt)));
}

function shoppingRow(item, checked = false) {
  const assignee = item.assigneeId ? memberById(item.assigneeId) : null;
  return `<li class="shopping-row ${checked ? "is-checked" : ""}">
    <button class="check-button" type="button" data-toggle-shopping="${esc(item.id)}" aria-label="${checked ? "Remettre" : "Cocher"} ${esc(item.label)}"><i class="ph ph-check"></i></button>
    <span class="row-copy"><b>${esc(item.label)}${item.favorite ? ` <i class="ph ph-star" aria-label="Favori"></i>` : ""}</b><small>${esc(item.quantity || "Quantité libre")} · ${esc(item.store || item.category || "Courses")}</small></span>
    <span class="row-actions">${assignee ? `<span class="assignment-chip">${avatar(assignee)} ${esc(assignee.name)}</span>` : ""}<button class="row-menu" type="button" data-menu="shopping" data-id="${esc(item.id)}" aria-label="Actions pour ${esc(item.label)}"><i class="ph ph-dots-three"></i></button></span>
  </li>`;
}

function renderShopping() {
  const active = activeShoppingItems();
  const checked = checkedShoppingItems();
  const groups = [...new Set(active.map((item) => item.category || "Épicerie"))];
  return `<section>
    <form class="quick-add" id="shopping-quick-form"><input id="shopping-quick-input" autocomplete="off" maxlength="90" placeholder="Ajouter un article… ex. café 2" aria-label="Ajouter un article à la liste de courses" required /><button class="primary-button accent" type="submit"><i class="ph ph-plus"></i><span>Ajouter</span></button></form>
    <div class="list-toolbar"><div class="suggestion-row">${shoppingSuggestions().map((label) => `<button class="suggestion-chip" type="button" data-shopping-suggestion="${esc(label)}">+ ${esc(label)}</button>`).join("")}</div><span class="section-label">${active.length} À PRENDRE</span></div>
    ${checked.length ? `<div class="shop-finish-banner"><div><h3>${checked.length} article${checked.length > 1 ? "s" : ""} pris récemment</h3><p>Course terminée ? Préremplis une dépense sans inventer le montant.</p></div><button class="secondary-button" type="button" data-shopping-paid>J’ai payé la course</button></div>` : ""}
    <div class="shopping-groups">
      ${active.length ? groups.map((category) => `<section class="shopping-group"><h3>${esc(category)}</h3><ul class="shopping-list">${active.filter((item) => (item.category || "Épicerie") === category).map((item) => shoppingRow(item)).join("")}</ul></section>`).join("") : emptyState("basket", "La liste est vide", "Ajoute du café, de la lessive ou ce qu’il manque dans l’Appartement.")}
      ${checked.length ? `<details class="history-details"><summary>Pris récemment · ${checked.length}<i class="ph ph-caret-down"></i></summary><ul class="shopping-list">${checked.slice(0, 20).map((item) => shoppingRow(item, true)).join("")}</ul></details>` : ""}
    </div>
  </section>`;
}

const ideaStatusLabel = {
  idea: "Idée",
  compare: "À comparer",
  decided: "Décidé",
  bought: "Acheté",
  abandoned: "Abandonné",
};

function ideaRow(idea) {
  const price = Number(idea.targetPrice) > 0
    ? (idea.currency === "EUR" ? euro.format(idea.targetPrice) : real.format(idea.targetPrice))
    : "Sans cible";
  return `<li class="decision-row">
    <button class="row-open" type="button" data-idea-id="${esc(idea.id)}" aria-label="Ouvrir ${esc(idea.title)}"><span class="row-identity"><span class="row-icon"><i class="ph ph-shopping-bag-open"></i></span><span class="row-copy"><b>${esc(idea.title)}</b><small>${esc(idea.note || (idea.opinion === "for" ? "Pour" : "À discuter"))}</small></span></span><span class="decision-price"><b>${esc(price)}</b><small class="idea-status is-${esc(idea.status)}">${esc(ideaStatusLabel[idea.status] || "Idée")}</small></span></button>
    <button class="row-menu" type="button" data-menu="idea" data-id="${esc(idea.id)}" aria-label="Actions pour ${esc(idea.title)}"><i class="ph ph-dots-three"></i></button>
  </li>`;
}

function renderIdeas() {
  const ideas = state.purchaseIdeas.filter((idea) => !idea.deletedAt)
    .sort((a, b) => ["decided", "compare", "idea", "bought", "abandoned"].indexOf(a.status) - ["decided", "compare", "idea", "bought", "abandoned"].indexOf(b.status));
  return `<section><div class="section-head"><div><h2>Achats de l’Appartement</h2><p>Une décision n’est jamais une dette.</p></div><button class="text-button" type="button" data-new-idea>+ Une idée</button></div>${ideas.length ? `<ul class="decision-list">${ideas.map(ideaRow).join("")}</ul>` : emptyState("shopping-bag-open", "Rien à décider", "Ajoute une machine, un meuble ou un achat important à comparer.", "Ajouter une idée", "new-idea")}</section>`;
}

function renderLists() {
  root.innerHTML = `<div class="stack">
    <header class="tasks-header"><div><p class="section-label">APPARTEMENT</p><h2>Listes</h2><p>Les courses immédiates et les achats à décider.</p></div></header>
    <div class="list-tabs"><button class="${listTab === "shopping" ? "is-active" : ""}" type="button" data-list-tab="shopping">Courses <span>${activeShoppingItems().length}</span></button><button class="${listTab === "ideas" ? "is-active" : ""}" type="button" data-list-tab="ideas">À décider <span>${state.purchaseIdeas.filter((item) => !item.deletedAt && !["bought", "abandoned"].includes(item.status)).length}</span></button></div>
    ${listTab === "shopping" ? renderShopping() : renderIdeas()}
  </div>`;
}

function dueInfo(task) {
  if (!task.dueDate) return ["Sans échéance", ""];
  const due = new Date(`${task.dueDate}T12:00:00`);
  const today = new Date(`${todayIso()}T12:00:00`);
  const days = Math.round((due - today) / 86_400_000);
  if (days < 0) return [`En retard de ${Math.abs(days)} j`, "is-overdue"];
  if (days === 0) return ["Aujourd’hui", "is-soon"];
  if (days <= 3) return [`Dans ${days} j`, "is-soon"];
  return [displayFullDate(task.dueDate), ""];
}

function taskRow(task) {
  const assignee = task.assigneeId ? memberById(task.assigneeId) : null;
  const [due, dueClass] = dueInfo(task);
  return `<li class="task-row ${task.completed ? "is-completed" : ""}">
    <button class="check-button" type="button" data-toggle-task="${esc(task.id)}" aria-label="${task.completed ? "Rouvrir" : "Terminer"} ${esc(task.title)}"><i class="ph ph-check"></i></button>
    <span class="row-copy"><b>${esc(task.title)}</b><small>${esc(task.note || "Tâche simple")} · <span class="due-date ${dueClass}">${esc(due)}</span></small></span>
    <span class="row-actions">${assignee ? `<span class="assignment-chip">${avatar(assignee)} ${esc(assignee.name)}</span>` : ""}<button class="row-menu" type="button" data-menu="task" data-id="${esc(task.id)}" aria-label="Actions pour ${esc(task.title)}"><i class="ph ph-dots-three"></i></button></span>
  </li>`;
}

function rotationIcon(taskId) {
  if (taskId.includes("laundry")) return "washing-machine";
  if (taskId.includes("trash")) return "trash";
  if (taskId.includes("clean")) return "broom";
  return "arrows-clockwise";
}

function renderTasks() {
  const rotating = state.tasks.filter((task) => task.type === "rotating" && !task.archived);
  const simple = state.tasks.filter((task) => task.type !== "rotating" && !task.archived && !task.completed);
  const completed = state.tasks.filter((task) => task.type !== "rotating" && !task.archived && task.completed);
  const soon = simple.filter((task) => {
    if (!task.dueDate) return false;
    const days = Math.round((new Date(`${task.dueDate}T12:00:00`) - new Date(`${todayIso()}T12:00:00`)) / 86_400_000);
    return days <= 3;
  });
  const balance = calculateBalances(state, APARTMENT_ID);
  root.innerHTML = `<div class="stack">
    <header class="tasks-header"><div><p class="section-label">APPARTEMENT</p><h2>Tâches</h2><p>À tour de rôle quand c’est utile, simplement assigné sinon.</p></div><button class="primary-button" type="button" data-action="task"><i class="ph ph-plus"></i> Ajouter une tâche</button></header>
    <section class="week-card"><div><h3>Cette semaine</h3><p>${soon.length} tâche${soon.length > 1 ? "s" : ""} dans les trois prochains jours, ${activeShoppingItems().length} article${activeShoppingItems().length > 1 ? "s" : ""} à acheter.</p></div><div class="week-stats"><div><b>${soon.length}</b><small>À suivre</small></div><div><b>${euro.format(Math.abs(balance.balances.gaspard || 0))}</b><small>Solde</small></div></div></section>
    <section><div class="section-head"><div><h2>À tour de rôle</h2><p>Une validation donne automatiquement la prochaine occurrence à l’autre.</p></div></div><div class="rotation-grid">${rotating.map((task) => {
      const person = memberById(task.assigneeId);
      return `<article class="rotation-card"><i class="ph ph-${rotationIcon(task.id)}"></i><h3>${esc(task.title)}</h3><div class="rotation-assignee">${avatar(person)} <span>Au tour de <b>${esc(person.name)}</b></span></div><button class="secondary-button" type="button" data-complete-rotation="${esc(task.id)}"><i class="ph ph-check"></i> Fait par ${esc(person.name)}</button></article>`;
    }).join("")}</div></section>
    <section><div class="section-head"><div><h2>Tâches simples</h2><p>Responsable et échéance restent facultatifs.</p></div><button class="text-button" type="button" data-action="task">+ Ajouter</button></div>${simple.length ? `<ul class="task-list">${simple.map(taskRow).join("")}</ul>` : emptyState("check-circle", "Aucune tâche en attente", "Ajoute seulement ce qui évite un vrai oubli.", "Ajouter une tâche", "task")}${completed.length ? `<details class="history-details"><summary>Terminées · ${completed.length}<i class="ph ph-caret-down"></i></summary><ul class="task-list">${completed.slice(0, 20).map(taskRow).join("")}</ul></details>` : ""}</section>
    <section><details class="history-details"><summary>Historique des tours<i class="ph ph-caret-down"></i></summary>${activityHistory(APARTMENT_ID)}</details></section>
  </div>`;
}

function updateChrome() {
  const titles = { accounts: ["APPARTEMENT", currentSpaceId === APARTMENT_ID ? "Comptes" : spaceById(currentSpaceId)?.name], lists: ["APPARTEMENT", "Listes"], tasks: ["APPARTEMENT", "Tâches"] };
  $("#view-eyebrow").textContent = titles[currentView][0];
  $("#view-title").textContent = titles[currentView][1];
  $("#mobile-context").textContent = titles[currentView][1];
  $$('[data-view]').forEach((button) => button.classList.toggle("is-active", button.dataset.view === currentView));
  const shoppingCount = activeShoppingItems().length;
  $("#shopping-nav-count").hidden = shoppingCount === 0;
  $("#shopping-nav-count").textContent = shoppingCount;
  const taskCount = state.tasks.filter((task) => task.type !== "rotating" && !task.archived && !task.completed).length;
  $("#tasks-nav-count").hidden = taskCount === 0;
  $("#tasks-nav-count").textContent = taskCount;
  const addLabels = { accounts: "Ajouter une dépense", lists: listTab === "shopping" ? "Ajouter un article" : "Ajouter un achat", tasks: "Ajouter une tâche" };
  $("#desktop-add span").textContent = addLabels[currentView];
  $("#mobile-add").setAttribute("aria-label", addLabels[currentView]);
}

function render() {
  document.documentElement.dataset.theme = state.preferences.theme === "light" ? "light" : "dark";
  updateChrome();
  if (currentView === "accounts") renderAccounts();
  else if (currentView === "lists") renderLists();
  else renderTasks();
}

function setView(view, options = {}) {
  currentView = ["accounts", "lists", "tasks"].includes(view) ? view : "accounts";
  if (options.spaceId) currentSpaceId = options.spaceId;
  if (currentView !== "accounts") currentSpaceId = APARTMENT_ID;
  expenseExpanded = false;
  const hash = currentView === "accounts" && currentSpaceId !== APARTMENT_ID
    ? `#group=${encodeURIComponent(currentSpaceId)}`
    : currentView === "lists" && listTab === "ideas"
      ? "#lists-decisions"
      : `#${currentView}`;
  history.replaceState(null, "", hash);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function parseHash() {
  if (location.hash.startsWith("#group=")) {
    currentView = "accounts";
    currentSpaceId = decodeURIComponent(location.hash.slice(7));
  } else if (location.hash === "#lists-decisions") {
    currentView = "lists";
    listTab = "ideas";
  } else if (["#accounts", "#lists", "#tasks"].includes(location.hash)) {
    currentView = location.hash.slice(1);
  }
}

function formHeader(eyebrow, title, close = true) {
  return `<header class="dialog-header"><div><p>${esc(eyebrow)}</p><h2 id="form-dialog-title">${esc(title)}</h2></div>${close ? `<button class="icon-button" type="button" data-dialog-close aria-label="Fermer"><i class="ph ph-x"></i></button>` : ""}</header>`;
}

function splitValuesMarkup(mode, participantIds, values = {}) {
  if (mode === "equal") return "";
  const count = participantIds.length || 1;
  return `<div class="split-values" id="split-values">${participantIds.map((memberId) => {
    const person = memberById(memberId);
    const value = values[memberId] ?? (mode === "percent" ? roundMoney(100 / count) : "");
    return `<label class="split-row"><span>${avatar(person)} ${esc(person.name)}</span><input data-split-member="${esc(memberId)}" type="number" min="0" step="0.01" value="${esc(value)}" aria-label="Part de ${esc(person.name)} ${mode === "percent" ? "en pourcentage" : "en euros"}" /></label>`;
  }).join("")}</div>`;
}

async function openExpenseForm({ expenseId = "", duplicateId = "", spaceId = currentSpaceId, draft = {} } = {}) {
  if (!(await ensureEditAccess())) return;
  const source = state.expenses.find((expense) => expense.id === (expenseId || duplicateId));
  const editing = expenseId ? source : null;
  const duplicate = duplicateId ? source : null;
  const data = editing || duplicate || draft;
  const space = spaceById(spaceId);
  const people = spaceMembers(spaceId);
  const preferredPayer = people.some((person) => person.id === data.payerId)
    ? data.payerId
    : people.some((person) => person.id === state.preferences.lastPayerId)
      ? state.preferences.lastPayerId
      : people[0]?.id;
  let currency = data.currency || state.preferences.lastCurrency || "BRL";
  let participantIds = data.participantIds?.filter((id) => people.some((person) => person.id === id)) || people.map((person) => person.id);
  let splitMode = data.splitMode || "equal";
  let receiptDataUrl = isSafeReceipt(data.receiptDataUrl) ? data.receiptDataUrl : "";
  let payerId = preferredPayer;
  let formDraft = {
    ...data,
    date: duplicate ? todayIso() : data.date || todayIso(),
    manualAmountEur: data.conversionMode === "manual-bank" ? data.amountEur : "",
  };
  let splitValueState = Object.fromEntries((data.shares || []).map((share) => [
    share.memberId,
    splitMode === "percent" && Number(data.amountEur)
      ? roundMoney((Number(share.amountEur) / Number(data.amountEur)) * 100)
      : share.amountEur,
  ]));
  const rate = currency === "BRL" ? await getLatestRate() : null;
  const title = editing ? "Modifier la dépense" : duplicate ? "Dupliquer la dépense" : "Nouvelle dépense";

  const captureFormDraft = () => {
    if (!$("#expense-form")) return;
    formDraft = {
      ...formDraft,
      amountOriginal: $("#expense-amount")?.value || "",
      title: $("#expense-title")?.value || "",
      exchangeRate: $("#expense-rate")?.value || formDraft.exchangeRate || "",
      manualAmountEur: $("#expense-bank-eur")?.value || formDraft.manualAmountEur || "",
      date: $("#expense-date")?.value || formDraft.date,
      category: $("#expense-category")?.value || formDraft.category,
      note: $("#expense-note")?.value || "",
      recurrence: $("#expense-recurring")?.checked ? { frequency: "monthly" } : null,
    };
    $$('[data-split-member]', formContent).forEach((input) => {
      splitValueState[input.dataset.splitMember] = input.value;
    });
  };

  const renderForm = () => {
    formContent.innerHTML = `${formHeader(space.name.toUpperCase(), title)}
      <form id="expense-form">
        <div class="sheet-body">
          <div class="expense-form-intro"><span class="form-step">01</span><div><b>Informations essentielles</b><p>Date et catégorie restent visibles dès le départ.</p></div></div>
          <div class="field-grid essential-fields">
            <label class="field"><span class="field-label">Date</span><input id="expense-date" type="date" value="${esc(formDraft.date || todayIso())}" required /></label>
            <label class="field"><span class="field-label">Catégorie</span><select id="expense-category" required>${["Courses", "Transport", "Restaurant", "Sortie", "Appartement", "Abonnement", "Autre"].map((category) => `<option ${category === (formDraft.category || "Courses") ? "selected" : ""}>${category}</option>`).join("")}</select></label>
            <label class="field wide"><span class="field-label">Dépense</span><input id="expense-title" maxlength="90" value="${esc(formDraft.title || "")}" placeholder="Ex. Courses Condor" required /></label>
            <label class="field wide"><span class="field-label">Montant et devise</span><span class="money-field"><input id="expense-amount" type="number" inputmode="decimal" min="0.01" step="0.01" value="${esc(formDraft.amountOriginal || "")}" placeholder="0,00" required autofocus /><span class="currency-toggle"><button type="button" data-currency="BRL" class="${currency === "BRL" ? "is-active" : ""}">R$</button><button type="button" data-currency="EUR" class="${currency === "EUR" ? "is-active" : ""}">€</button></span></span></label>
          </div>
          <div class="suggestion-row" style="margin-top:10px">${(state.preferences.recentExpenseLabels || []).slice(0, 5).map((label) => `<button class="suggestion-chip" type="button" data-expense-label="${esc(label)}">${esc(label)}</button>`).join("")}</div>
          <section id="currency-panel" class="form-section">
            ${currency === "BRL" ? `<div class="rate-card ${rate ? "" : "is-error"}" id="rate-card"><div><b>${rate ? `1 € = ${compactNumber.format(rate.rate)} R$` : "Taux automatique indisponible"}</b><small>${rate ? `${displayFullDate(rate.date)} · ${esc(rate.source)}` : "Entre un taux manuel ou attends le retour du réseau."}</small></div><i class="ph ${rate ? "ph-check-circle" : "ph-warning-circle"}"></i></div>
              <div class="field-grid" style="margin-top:12px"><label class="field"><span class="field-label">Taux EUR/BRL</span><input id="expense-rate" type="number" min="0.0001" step="0.0001" value="${esc(formDraft.exchangeRate || rate?.rate || "")}" placeholder="Ex. 6,0315" required /></label><label class="field"><span class="field-label">Débit bancaire en € (facultatif)</span><input id="expense-bank-eur" type="number" min="0.01" step="0.01" value="${esc(formDraft.manualAmountEur || "")}" placeholder="Valeur exacte du relevé" /></label></div>` : `<div class="rate-card"><div><b>Montant déjà en euros</b><small>Taux 1 · aucun appel de conversion.</small></div><i class="ph ph-check-circle"></i></div>`}
          </section>

          <section class="form-section"><div class="expense-form-intro compact"><span class="form-step">02</span><div><b>Qui paie et qui partage ?</b><p>Les deux résidents sont sélectionnés par défaut.</p></div></div><p class="form-section-title">PAYEUR</p><div class="participant-grid">${people.map((person) => `<button class="participant-toggle ${person.id === payerId ? "is-active" : ""}" type="button" data-payer="${esc(person.id)}">${avatar(person)}<span>${esc(person.name)}</span></button>`).join("")}</div></section>
          <section class="form-section"><div class="sheet-title-row"><p class="form-section-title">PARTAGÉ AVEC</p><button class="text-button" type="button" id="select-everyone">Tout le monde</button></div><div class="participant-grid" id="expense-participants">${people.map((person) => `<button class="participant-toggle ${participantIds.includes(person.id) ? "is-active" : ""}" type="button" data-participant="${esc(person.id)}">${avatar(person)}<span>${esc(person.name)}</span></button>`).join("")}</div><label class="field" style="margin-top:12px"><span class="field-label">Répartition</span><select id="split-mode"><option value="equal" ${splitMode === "equal" ? "selected" : ""}>À parts égales</option><option value="exact" ${splitMode === "exact" ? "selected" : ""}>Montants exacts en €</option><option value="percent" ${splitMode === "percent" ? "selected" : ""}>Pourcentages</option></select></label><div id="split-values-root">${splitValuesMarkup(splitMode, participantIds, splitValueState)}</div></section>

          <section class="form-section optional-fields"><div class="expense-form-intro compact"><span class="form-step">03</span><div><b>Facultatif</b><p>Ajoute seulement ce qui sera utile plus tard.</p></div></div><div class="field-grid">
            <label class="field wide"><span class="field-label">Note</span><textarea id="expense-note" maxlength="500" placeholder="Ex. partagé avec les invités de la soirée">${esc(formDraft.note || "")}</textarea></label>
            <div class="receipt-field wide"><span class="field-label">Photo du ticket</span><label class="receipt-input"><input id="expense-receipt" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" />${receiptDataUrl ? `<img class="receipt-preview" src="${receiptDataUrl}" alt="Aperçu du ticket" />` : `<span><i class="ph ph-camera"></i>Prendre ou choisir une photo</span>`}</label>${receiptDataUrl ? `<button class="quiet-button remove-receipt" type="button" data-remove-receipt><i class="ph ph-trash"></i> Retirer la photo</button>` : ""}</div>
          </div><label class="toggle-row"><span><b>Dépense récurrente</b><small>Loyer, internet ou abonnement — chaque création reste confirmée.</small></span><span class="switch"><input id="expense-recurring" type="checkbox" ${formDraft.recurrence ? "checked" : ""}/><span></span></span></label></section>
          <p class="form-error" id="expense-error" hidden></p>
        </div>
        <div class="form-actions"><button class="secondary-button" type="button" data-dialog-close>Annuler</button><button class="primary-button accent" type="submit">${editing ? "Enregistrer" : "Ajouter la dépense"}</button></div>
      </form>`;

    showDialog(formDialog);
    $$('[data-currency]', formContent).forEach((button) => button.addEventListener("click", () => {
      captureFormDraft();
      currency = button.dataset.currency;
      formDraft.currency = currency;
      state.preferences.lastCurrency = currency;
      renderForm();
    }));
    $$('[data-payer]', formContent).forEach((button) => button.addEventListener("click", () => {
      payerId = button.dataset.payer;
      $$('[data-payer]', formContent).forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
    }));
    const refreshSplit = () => {
      $$('[data-split-member]', formContent).forEach((input) => {
        splitValueState[input.dataset.splitMember] = input.value;
      });
      $("#split-values-root").innerHTML = splitValuesMarkup(splitMode, participantIds, splitValueState);
    };
    $$('[data-participant]', formContent).forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.participant;
      if (participantIds.includes(id)) participantIds = participantIds.filter((value) => value !== id);
      else participantIds.push(id);
      button.classList.toggle("is-active", participantIds.includes(id));
      refreshSplit();
    }));
    $("#select-everyone").addEventListener("click", () => {
      participantIds = people.map((person) => person.id);
      $$('[data-participant]', formContent).forEach((button) => button.classList.add("is-active"));
      refreshSplit();
    });
    $("#split-mode").addEventListener("change", (event) => {
      splitMode = event.target.value;
      splitValueState = {};
      refreshSplit();
    });
    $$('[data-expense-label]', formContent).forEach((button) => button.addEventListener("click", () => {
      $("#expense-title").value = button.dataset.expenseLabel;
    }));
    $("#expense-receipt").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        captureFormDraft();
        receiptDataUrl = await compressReceipt(file);
        renderForm();
      } catch (error) {
        toast(error.message, "error");
      }
    });
    $("[data-remove-receipt]")?.addEventListener("click", () => {
      captureFormDraft();
      receiptDataUrl = "";
      renderForm();
    });
    $("#expense-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorNode = $("#expense-error");
      try {
        const amountOriginal = Number($("#expense-amount").value);
        const manualAmountEur = currency === "BRL" ? Number($("#expense-bank-eur")?.value) : undefined;
        const exchangeRate = currency === "BRL" ? Number($("#expense-rate")?.value) : 1;
        const conversion = convertToEur({ amountOriginal, currency, exchangeRate, manualAmountEur });
        const splitValues = Object.fromEntries($$('[data-split-member]', formContent).map((input) => [input.dataset.splitMember, Number(input.value)]));
        const shares = calculateShares({ amountEur: conversion.amountEur, participantIds, mode: splitMode, values: splitValues });
        const now = isoNow();
        const next = {
          id: editing?.id || entityId("expense"),
          spaceId,
          title: $("#expense-title").value.trim(),
          payerId,
          participantIds,
          amountOriginal,
          currency,
          amountEur: conversion.amountEur,
          exchangeRate: conversion.exchangeRate,
          exchangeRateDate: currency === "BRL" ? (conversion.conversionMode === "manual-bank" ? $("#expense-date").value : rate?.date || $("#expense-date").value) : $("#expense-date").value,
          exchangeRateSource: currency === "BRL" ? (conversion.conversionMode === "manual-bank" ? "Débit bancaire saisi manuellement" : rate?.source || "Taux manuel") : "Montant en euros",
          conversionMode: conversion.conversionMode,
          category: $("#expense-category").value,
          splitMode,
          shares,
          date: $("#expense-date").value,
          note: $("#expense-note").value.trim(),
          receiptDataUrl,
          recurrence: $("#expense-recurring").checked ? { frequency: "monthly" } : null,
          createdAt: editing?.createdAt || now,
          updatedAt: now,
        };
        const saved = await mutate(payerId, editing ? "Modification de dépense" : duplicate ? "Duplication de dépense" : "Ajout de dépense", (draftState) => {
          draftState.expenses = [...draftState.expenses.filter((item) => item.id !== next.id), next];
          draftState.preferences.lastPayerId = payerId;
          draftState.preferences.lastCurrency = currency;
          draftState.preferences.recentExpenseLabels = [next.title, ...(draftState.preferences.recentExpenseLabels || []).filter((label) => label !== next.title)].slice(0, 12);
          if (next.recurrence) {
            const nextDate = new Date(`${next.date}T12:00:00`);
            nextDate.setMonth(nextDate.getMonth() + 1);
            draftState.recurringExpenses = [
              ...draftState.recurringExpenses.filter((item) => item.sourceExpenseId !== next.id),
              { id: entityId("recurring"), sourceExpenseId: next.id, title: next.title, nextDate: nextDate.toISOString().slice(0, 10), archived: false, updatedAt: now },
            ];
          }
          addActivity(editing ? "expense-edit" : "expense-add", `${memberById(payerId).name} a ${editing ? "modifié" : "ajouté"} ${next.title}`, "expense", next.id, null, payerId);
        });
        if (saved) {
          closeDialog(formDialog);
          toast(editing ? "Dépense mise à jour." : "Dépense ajoutée.");
        }
      } catch (error) {
        errorNode.textContent = error.message || "Vérifie les informations.";
        errorNode.hidden = false;
      }
    });
    setTimeout(() => $("#expense-amount")?.focus(), 60);
  };
  renderForm();
}

async function compressReceipt(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choisis une image de ticket.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Le ticket dépasse 12 Mo.");
  const bitmap = await createImageBitmap(file);
  const max = 1280;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let quality = 0.74;
  let data = canvas.toDataURL("image/jpeg", quality);
  while (data.length > 620_000 && quality > 0.42) {
    quality -= 0.08;
    data = canvas.toDataURL("image/jpeg", quality);
  }
  if (data.length > 720_000) throw new Error("Le ticket reste trop lourd après compression.");
  return data;
}

function openExpenseDetail(expenseIdValue) {
  const expense = state.expenses.find((item) => item.id === expenseIdValue);
  if (!expense) return;
  const payer = memberById(expense.payerId);
  const shares = expense.shares || [];
  formContent.innerHTML = `${formHeader(expense.category || "DÉPENSE", expense.title)}<div class="sheet-body">
    <div class="balance-value" style="font-size:48px">${esc(expenseOriginal(expense))}</div>
    ${expense.currency === "BRL" ? `<p class="balance-copy">Valeur de règlement figée : <b>${euro.format(expense.amountEur)}</b> · 1 € = ${compactNumber.format(expense.exchangeRate)} R$.</p><div class="rate-card" style="margin-top:16px"><div><b>${esc(expense.exchangeRateSource)}</b><small>${displayFullDate(expense.exchangeRateDate)} · ${expense.conversionMode === "manual-bank" ? "débit bancaire réel" : "taux de référence"}</small></div><i class="ph ph-lock-key"></i></div>` : `<p class="balance-copy">Dépense directement saisie en euros · taux 1.</p>`}
    <section class="form-section"><p class="form-section-title">PAYÉ PAR</p><div class="row-identity">${avatar(payer)}<span class="row-copy"><b>${esc(payer.name)}</b><small>${displayFullDate(expense.date)}</small></span></div></section>
    <section class="form-section"><p class="form-section-title">RÉPARTITION · ${expense.splitMode === "percent" ? "POURCENTAGES" : expense.splitMode === "exact" ? "MONTANTS EXACTS" : "PARTS ÉGALES"}</p><ul class="people-list">${shares.map((share) => `<li class="person-row"><span class="row-identity">${avatar(share.memberId)}<span class="row-copy"><b>${esc(memberById(share.memberId).name)}</b></span></span><span class="person-balance"><b>${euro.format(share.amountEur)}</b></span></li>`).join("")}</ul></section>
    ${expense.note ? `<section class="form-section"><p class="form-section-title">NOTE</p><p class="balance-copy">${esc(expense.note)}</p></section>` : ""}
    ${isSafeReceipt(expense.receiptDataUrl) ? `<section class="form-section"><p class="form-section-title">TICKET</p><img class="receipt-preview" src="${expense.receiptDataUrl}" alt="Ticket joint à ${esc(expense.title)}" /></section>` : ""}
  </div><div class="form-actions"><button class="danger-button" type="button" data-cancel-expense="${esc(expense.id)}">Annuler la dépense</button><button class="secondary-button" type="button" data-duplicate-expense="${esc(expense.id)}">Dupliquer</button><button class="primary-button" type="button" data-edit-expense="${esc(expense.id)}">Modifier</button></div>`;
  showDialog(formDialog);
}

async function cancelExpense(expenseIdValue) {
  const expense = state.expenses.find((item) => item.id === expenseIdValue);
  if (!expense) return;
  const confirmed = await confirmChoice({
    eyebrow: "ACTION RÉCUPÉRABLE",
    title: "Annuler cette dépense ?",
    copy: `« ${expense.title} » disparaîtra des soldes mais restera restaurable dans l’activité.`,
    confirmLabel: "Annuler la dépense",
    danger: true,
  });
  if (!confirmed) return;
  closeDialog(formDialog);
  await mutate("gaspard", "Annulation de dépense", (draft) => {
    const target = draft.expenses.find((item) => item.id === expenseIdValue);
    target.deletedAt = isoNow();
    target.updatedAt = isoNow();
    addActivity("expense-cancel", `${target.title} a été annulée`, "expense", target.id, structuredClone(target));
  });
  toast("Dépense annulée.", "success", { label: "Restaurer", run: () => restoreExpense(expenseIdValue) });
}

async function restoreExpense(expenseIdValue) {
  await mutate("gaspard", "Restauration de dépense", (draft) => {
    const expense = draft.expenses.find((item) => item.id === expenseIdValue);
    if (!expense) return;
    delete expense.deletedAt;
    expense.updatedAt = isoNow();
    addActivity("expense-restore", `${expense.title} a été restaurée`, "expense", expense.id);
  });
}

function confirmChoice({ eyebrow, title, copy, confirmLabel = "Confirmer", cancelLabel = "Annuler", danger = false }) {
  formContent.innerHTML = `${formHeader(eyebrow, title)}<div class="sheet-body"><p class="sheet-intro">${esc(copy)}</p></div><div class="form-actions"><button class="secondary-button" type="button" data-confirm-cancel>${esc(cancelLabel)}</button><button class="${danger ? "danger-button" : "primary-button"}" type="button" data-confirm-accept>${esc(confirmLabel)}</button></div>`;
  showDialog(formDialog);
  return new Promise((resolve) => {
    $("[data-confirm-cancel]", formContent).addEventListener("click", () => { closeDialog(formDialog); resolve(false); });
    $("[data-confirm-accept]", formContent).addEventListener("click", () => { closeDialog(formDialog); resolve(true); });
  });
}

async function openSettlementForm({ spaceId, fromId, toId, amountEur }) {
  if (!(await ensureEditAccess())) return;
  const from = memberById(fromId);
  const to = memberById(toId);
  formContent.innerHTML = `${formHeader("VIREMENT EN EUROS", "Marquer le règlement")}<form id="settlement-form"><div class="sheet-body"><div class="settlement-card"><div class="settlement-route">${avatar(from)}<b>${esc(from.name)}</b><i class="ph ph-arrow-right"></i>${avatar(to)}<b>${esc(to.name)}</b></div></div><div class="field-grid" style="margin-top:18px"><label class="field"><span class="field-label">Montant en €</span><input id="settlement-amount" type="number" min="0.01" step="0.01" value="${Number(amountEur).toFixed(2)}" required /></label><label class="field"><span class="field-label">Date</span><input id="settlement-date" type="date" value="${todayIso()}" required /></label><label class="field wide"><span class="field-label">Note</span><input id="settlement-note" maxlength="160" placeholder="Ex. Virement Revolut" /></label></div></div><div class="form-actions"><button class="secondary-button" type="button" data-dialog-close>Annuler</button><button class="primary-button accent" type="submit">Marquer réglé</button></div></form>`;
  showDialog(formDialog);
  $("#settlement-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const amount = Number($("#settlement-amount").value);
    if (!(amount > 0)) return;
    const saved = await mutate(fromId, "Règlement marqué", (draft) => {
      draft.settlements.unshift({ id: entityId("settlement"), spaceId, fromId, toId, amountEur: roundMoney(amount), date: $("#settlement-date").value, note: $("#settlement-note").value.trim(), createdAt: isoNow(), updatedAt: isoNow() });
      addActivity("settlement", `${from.name} a réglé ${euro.format(amount)} à ${to.name}`, "settlement", "", null, fromId);
    });
    if (saved) { closeDialog(formDialog); toast("Règlement enregistré."); }
  });
}

function openPersonDetail(personId, spaceId) {
  const person = memberById(personId);
  const result = calculateBalances(state, spaceId);
  const balance = result.balances[personId] || 0;
  const expenses = state.expenses.filter((expense) => expense.spaceId === spaceId && !expense.deletedAt && (expense.payerId === personId || expense.participantIds?.includes(personId)));
  formContent.innerHTML = `${formHeader(spaceById(spaceId).name.toUpperCase(), person.name)}<div class="sheet-body"><div class="row-identity">${avatar(person)}<div><div class="balance-value ${balance > 0 ? "is-positive" : balance < 0 ? "is-negative" : ""}" style="font-size:44px">${euro.format(Math.abs(balance))}</div><p class="balance-copy">${balance > 0.005 ? "À recevoir" : balance < -0.005 ? "À rembourser" : "À l’équilibre"}</p></div></div><div class="group-summary"><div class="metric"><span>AVANCÉ</span><b>${euro.format(result.paid[personId] || 0)}</b></div><div class="metric"><span>PART</span><b>${euro.format(result.owed[personId] || 0)}</b></div><div class="metric"><span>LIGNES</span><b>${expenses.length}</b></div></div><section class="form-section"><p class="form-section-title">DÉPENSES CONCERNÉES</p>${expenses.length ? `<ul class="data-list">${expenses.slice(0, 20).map(expenseRow).join("")}</ul>` : `<p class="sheet-intro">Aucune dépense.</p>`}</section></div>`;
  showDialog(formDialog);
}

async function openGroupForm() {
  if (!(await ensureEditAccess())) return;
  let guests = [];
  const redraw = () => {
    formContent.innerHTML = `${formHeader("GROUPE PONCTUEL", "Nouvelle soirée")}<form id="group-form"><div class="sheet-body"><p class="sheet-intro">Le groupe reste séparé de l’Appartement et se clôture seulement quand vous le décidez.</p><div class="field-grid"><label class="field wide"><span class="field-label">Nom du groupe</span><input id="group-name" maxlength="80" placeholder="Ex. Dîner chez nous" required autofocus /></label><label class="field"><span class="field-label">Date</span><input id="group-date" type="date" value="${todayIso()}" required /></label><label class="field"><span class="field-label">Devise habituelle</span><select id="group-currency"><option value="BRL">Real brésilien (R$)</option><option value="EUR">Euro (€)</option></select></label></div><section class="form-section"><p class="form-section-title">PARTICIPANTS PERMANENTS</p><div class="participant-grid">${RESIDENT_IDS.map((id) => `<span class="participant-toggle is-active">${avatar(id)}<span>${esc(memberById(id).name)}</span></span>`).join("")}</div></section><section class="form-section"><p class="form-section-title">INVITÉS SANS COMPTE</p><div class="quick-add"><input id="guest-name" maxlength="40" placeholder="Prénom ou surnom" /><button class="secondary-button" type="button" id="add-guest-inline"><i class="ph ph-plus"></i></button></div><div class="chip-row" style="margin-top:10px">${guests.map((guest) => `<button class="choice-chip is-active" type="button" data-remove-guest="${esc(guest.id)}">${esc(guest.name)} ×</button>`).join("")}</div></section></div><div class="form-actions"><button class="secondary-button" type="button" data-dialog-close>Annuler</button><button class="primary-button accent" type="submit">Créer le groupe</button></div></form>`;
    showDialog(formDialog);
    $("#add-guest-inline").addEventListener("click", () => {
      const name = $("#guest-name").value.trim();
      if (!name) return;
      guests.push({ id: entityId("guest"), name, initial: name.slice(0, 1).toUpperCase(), type: "guest", color: "guest", createdAt: isoNow(), updatedAt: isoNow() });
      redraw();
    });
    $$('[data-remove-guest]', formContent).forEach((button) => button.addEventListener("click", () => { guests = guests.filter((guest) => guest.id !== button.dataset.removeGuest); redraw(); }));
    $("#group-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const group = { id: entityId("group"), name: $("#group-name").value.trim(), type: "group", status: "open", currency: $("#group-currency").value, memberIds: [...RESIDENT_IDS, ...guests.map((guest) => guest.id)], date: $("#group-date").value, createdAt: isoNow(), updatedAt: isoNow() };
      const saved = await mutate("gaspard", "Création d’un groupe", (draft) => {
        draft.members.push(...guests);
        draft.spaces.push(group);
        addActivity("group-add", `${group.name} a été créé`, "space", group.id, null, "gaspard");
      });
      if (saved) { closeDialog(formDialog); currentSpaceId = group.id; setView("accounts", { spaceId: group.id }); toast("Groupe créé."); }
    });
  };
  redraw();
}

async function openGuestForm() {
  if (!(await ensureEditAccess())) return;
  const space = spaceById(currentSpaceId);
  formContent.innerHTML = `${formHeader(space.name.toUpperCase(), "Ajouter un invité")}<form id="guest-form"><div class="sheet-body"><p class="sheet-intro">L’invité sera visible uniquement dans ce groupe.</p><label class="field"><span class="field-label">Prénom ou surnom</span><input id="guest-name" maxlength="40" required autofocus placeholder="Ex. Ana" /></label></div><div class="form-actions"><button class="secondary-button" type="button" data-dialog-close>Annuler</button><button class="primary-button accent" type="submit">Ajouter</button></div></form>`;
  showDialog(formDialog);
  $("#guest-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#guest-name").value.trim();
    const guest = { id: entityId("guest"), name, initial: name.slice(0, 1).toUpperCase(), type: "guest", color: "guest", createdAt: isoNow(), updatedAt: isoNow() };
    const saved = await mutate("gaspard", "Ajout d’un invité", (draft) => {
      draft.members.push(guest);
      const target = draft.spaces.find((item) => item.id === space.id);
      target.memberIds.push(guest.id);
      target.updatedAt = isoNow();
      addActivity("guest-add", `${name} a rejoint ${space.name}`, "space", space.id, null, "gaspard");
    });
    if (saved) { closeDialog(formDialog); toast(`${name} ajouté au groupe.`); }
  });
}

async function closeGroupReview() {
  const space = spaceById(currentSpaceId);
  const expenses = state.expenses.filter((expense) => expense.spaceId === space.id && !expense.deletedAt);
  const { balances } = calculateBalances(state, space.id);
  const suggestions = suggestSettlements(balances);
  formContent.innerHTML = `${formHeader("VÉRIFICATION", `Clôturer ${space.name}`)}<div class="sheet-body"><p class="sheet-intro">Vérifie les lignes avant d’envoyer les règlements. La clôture n’efface rien et le groupe pourra être rouvert.</p><div class="group-summary"><div class="metric"><span>DÉPENSES</span><b>${expenses.length}</b></div><div class="metric"><span>TOTAL</span><b>${euro.format(expenses.reduce((sum, item) => sum + Number(item.amountEur), 0))}</b></div><div class="metric"><span>VIREMENTS</span><b>${suggestions.length}</b></div></div><section class="form-section"><p class="form-section-title">RÈGLEMENTS PROPOSÉS</p>${suggestions.length ? `<ul class="settlement-list">${suggestions.map((move) => `<li class="settlement-row"><span>${esc(memberById(move.fromId).name)} → ${esc(memberById(move.toId).name)}</span><b>${euro.format(move.amountEur)}</b></li>`).join("")}</ul>` : `<p class="sheet-intro">Tout le monde est à l’équilibre.</p>`}</section></div><div class="form-actions"><button class="secondary-button" type="button" data-dialog-close>Continuer à modifier</button><button class="primary-button accent" type="button" id="confirm-close-group">Clôturer le groupe</button></div>`;
  showDialog(formDialog);
  $("#confirm-close-group").addEventListener("click", async () => {
    const saved = await mutate("gaspard", "Clôture d’un groupe", (draft) => {
      const target = draft.spaces.find((item) => item.id === space.id);
      target.status = "closed";
      target.closedAt = isoNow();
      target.updatedAt = isoNow();
      addActivity("group-close", `${space.name} a été clôturé`, "space", space.id, null, "gaspard");
    });
    if (saved) { closeDialog(formDialog); groupTab = "settlements"; render(); toast("Groupe clôturé."); }
  });
}

async function reopenGroup() {
  await mutate("gaspard", "Réouverture d’un groupe", (draft) => {
    const target = draft.spaces.find((item) => item.id === currentSpaceId);
    target.status = "open";
    delete target.closedAt;
    target.updatedAt = isoNow();
    addActivity("group-open", `${target.name} a été rouvert`, "space", target.id, null, "gaspard");
  });
}

async function copyGroupSummary() {
  const space = spaceById(currentSpaceId);
  const { balances } = calculateBalances(state, space.id);
  const suggestions = suggestSettlements(balances);
  const lines = [
    `${space.name} · règlement en euros`,
    ...suggestions.map((move) => `${memberById(move.fromId).name} doit ${euro.format(move.amountEur)} à ${memberById(move.toId).name}`),
  ];
  await navigator.clipboard.writeText(lines.join("\n"));
  toast("Résumé invité copié.");
}

function parseShoppingInput(value) {
  const match = value.trim().match(/^(.*?)(?:\s+x?([0-9]+(?:[.,][0-9]+)?))?$/);
  const label = (match?.[1] || value).trim();
  const quantity = match?.[2] ? match[2].replace(",", ".") : "";
  return { label: label.charAt(0).toUpperCase() + label.slice(1), quantity };
}

async function addShoppingItem(value) {
  const { label, quantity } = parseShoppingInput(value);
  if (!label) return;
  const duplicate = activeShoppingItems().find((item) => item.label.toLowerCase() === label.toLowerCase());
  let keepSeparate = false;
  if (duplicate) {
    keepSeparate = !(await confirmChoice({ eyebrow: "DOUBLON POSSIBLE", title: `${label} est déjà dans la liste`, copy: "Tu peux augmenter doucement sa quantité ou garder deux lignes distinctes.", confirmLabel: "Augmenter la quantité", cancelLabel: "Garder séparé" }));
  }
  await mutate("gaspard", "Mise à jour des courses", (draft) => {
    if (duplicate && !keepSeparate) {
      const item = draft.shoppingItems.find((candidate) => candidate.id === duplicate.id);
      const current = Number(item.quantity) || 1;
      item.quantity = String(current + (Number(quantity) || 1));
      item.updatedAt = isoNow();
      addActivity("shopping-edit", `${label} a été regroupé dans les courses`, "shopping", item.id, null, "gaspard");
    } else {
      const item = { id: entityId("shopping"), label, quantity, category: categoryForItem(label), assigneeId: "", favorite: false, store: "", createdAt: isoNow(), updatedAt: isoNow() };
      draft.shoppingItems.unshift(item);
      addActivity("shopping-add", `Gaspard a ajouté ${label}`, "shopping", item.id, null, "gaspard");
    }
  });
}

async function toggleShopping(itemId) {
  const item = state.shoppingItems.find((candidate) => candidate.id === itemId);
  if (!item) return;
  const checking = !item.checkedAt;
  await mutate("gaspard", checking ? "Article pris" : "Article remis", (draft) => {
    const target = draft.shoppingItems.find((candidate) => candidate.id === itemId);
    if (checking) target.checkedAt = isoNow();
    else delete target.checkedAt;
    target.updatedAt = isoNow();
    addActivity("shopping-check", `${target.label} ${checking ? "a été pris" : "revient dans la liste"}`, "shopping", target.id, null, "gaspard");
  });
}

async function openPurchaseChooser() {
  if (!(await ensureEditAccess())) return;
  formContent.innerHTML = `${formHeader("À ACHETER", "Quel type d’achat ?")}<div class="action-grid"><button class="action-choice" type="button" data-purchase-kind="shopping"><span class="action-icon action-icon-green"><i class="ph ph-basket"></i></span><span><strong>Course rapide</strong><small>Un article à prendre au magasin</small></span><i class="ph ph-caret-right"></i></button><button class="action-choice" type="button" data-purchase-kind="idea"><span class="action-icon action-icon-blue"><i class="ph ph-shopping-bag-open"></i></span><span><strong>Achat à décider</strong><small>Prix cible, lien, statut et avis</small></span><i class="ph ph-caret-right"></i></button></div>`;
  showDialog(formDialog);
  $$('[data-purchase-kind]', formContent).forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.purchaseKind === "shopping") openShoppingForm();
    else openIdeaForm();
  }));
}

async function openShoppingForm(itemId = "") {
  if (!(await ensureEditAccess())) return;
  const item = state.shoppingItems.find((candidate) => candidate.id === itemId);
  formContent.innerHTML = `${formHeader("LISTE COURSES", item ? "Modifier l’article" : "Ajouter une course")}<form id="shopping-form"><div class="sheet-body"><div class="field-grid"><label class="field wide"><span class="field-label">Article</span><input id="shopping-label" maxlength="90" value="${esc(item?.label || "")}" required autofocus placeholder="Ex. Café" /></label><label class="field"><span class="field-label">Quantité</span><input id="shopping-quantity" maxlength="30" value="${esc(item?.quantity || "")}" placeholder="Ex. 2 paquets" /></label><label class="field"><span class="field-label">Catégorie</span><select id="shopping-category">${["Fruits et légumes", "Frais", "Épicerie", "Ménage", "Pharmacie", "Appartement"].map((category) => `<option ${category === item?.category ? "selected" : ""}>${category}</option>`).join("")}</select></label><label class="field"><span class="field-label">Responsable</span><select id="shopping-assignee"><option value="">Tout le monde</option>${RESIDENT_IDS.map((id) => `<option value="${id}" ${id === item?.assigneeId ? "selected" : ""}>${esc(memberById(id).name)}</option>`).join("")}</select></label><label class="field"><span class="field-label">Magasin / étiquette</span><input id="shopping-store" maxlength="50" value="${esc(item?.store || "")}" placeholder="Ex. Mercado" /></label></div><label class="toggle-row"><span><b>Essentiel favori</b><small>Apparaît dans les suggestions rapides.</small></span><span class="switch"><input id="shopping-favorite" type="checkbox" ${item?.favorite ? "checked" : ""}/><span></span></span></label></div><div class="form-actions"><button class="secondary-button" type="button" data-dialog-close>Annuler</button><button class="primary-button accent" type="submit">Enregistrer</button></div></form>`;
  showDialog(formDialog);
  if (!item) $("#shopping-category").value = "Épicerie";
  $("#shopping-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const now = isoNow();
    const next = { id: item?.id || entityId("shopping"), label: $("#shopping-label").value.trim(), quantity: $("#shopping-quantity").value.trim(), category: $("#shopping-category").value, assigneeId: $("#shopping-assignee").value, store: $("#shopping-store").value.trim(), favorite: $("#shopping-favorite").checked, createdAt: item?.createdAt || now, updatedAt: now };
    const saved = await mutate(next.assigneeId || "gaspard", item ? "Modification des courses" : "Ajout aux courses", (draft) => {
      draft.shoppingItems = [...draft.shoppingItems.filter((candidate) => candidate.id !== next.id), next];
      if (next.favorite) draft.preferences.favoriteShopping = [next.label, ...(draft.preferences.favoriteShopping || []).filter((label) => label !== next.label)].slice(0, 12);
      addActivity(item ? "shopping-edit" : "shopping-add", `${next.label} ${item ? "a été modifié" : "a été ajouté"}`, "shopping", next.id, null, next.assigneeId || "gaspard");
    });
    if (saved) { closeDialog(formDialog); currentView = "lists"; listTab = "shopping"; render(); toast("Liste mise à jour."); }
  });
}

async function openIdeaForm(ideaId = "") {
  if (!(await ensureEditAccess())) return;
  const idea = state.purchaseIdeas.find((candidate) => candidate.id === ideaId);
  formContent.innerHTML = `${formHeader("À DÉCIDER", idea ? "Modifier l’achat" : "Nouvel achat")}<form id="idea-form"><div class="sheet-body"><div class="field-grid"><label class="field wide"><span class="field-label">Objet</span><input id="idea-title" maxlength="90" value="${esc(idea?.title || "")}" required autofocus placeholder="Ex. Machine à laver" /></label><label class="field"><span class="field-label">Statut</span><select id="idea-status">${Object.entries(ideaStatusLabel).map(([value, label]) => `<option value="${value}" ${value === (idea?.status || "idea") ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="field"><span class="field-label">Avis</span><select id="idea-opinion"><option value="discuss" ${idea?.opinion !== "for" ? "selected" : ""}>À discuter</option><option value="for" ${idea?.opinion === "for" ? "selected" : ""}>Pour</option></select></label><label class="field"><span class="field-label">Prix cible</span><input id="idea-price" type="number" min="0" step="0.01" value="${esc(idea?.targetPrice || "")}" placeholder="Facultatif" /></label><label class="field"><span class="field-label">Devise</span><select id="idea-currency"><option value="BRL" ${idea?.currency !== "EUR" ? "selected" : ""}>R$</option><option value="EUR" ${idea?.currency === "EUR" ? "selected" : ""}>€</option></select></label><label class="field wide"><span class="field-label">Lien produit</span><input id="idea-link" type="url" value="${esc(idea?.link || "")}" placeholder="https://…" /></label><label class="field wide"><span class="field-label">Note</span><textarea id="idea-note" maxlength="500" placeholder="Comparaison, dimensions, contraintes…">${esc(idea?.note || "")}</textarea></label></div></div><div class="form-actions"><button class="secondary-button" type="button" data-dialog-close>Annuler</button><button class="primary-button accent" type="submit">Enregistrer</button></div></form>`;
  showDialog(formDialog);
  $("#idea-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const link = $("#idea-link").value.trim();
    if (link && !safeUrl(link)) { toast("Le lien produit doit commencer par http:// ou https://.", "error"); return; }
    const now = isoNow();
    const next = { id: idea?.id || entityId("idea"), title: $("#idea-title").value.trim(), status: $("#idea-status").value, opinion: $("#idea-opinion").value, targetPrice: Number($("#idea-price").value) || 0, currency: $("#idea-currency").value, link, note: $("#idea-note").value.trim(), createdAt: idea?.createdAt || now, updatedAt: now };
    const saved = await mutate("gaspard", idea ? "Modification d’un achat" : "Ajout d’un achat", (draft) => {
      draft.purchaseIdeas = [...draft.purchaseIdeas.filter((candidate) => candidate.id !== next.id), next];
      addActivity(idea ? "idea-edit" : "idea-add", `${next.title} · ${ideaStatusLabel[next.status]}`, "idea", next.id, null, "gaspard");
    });
    if (saved) { closeDialog(formDialog); currentView = "lists"; listTab = "ideas"; render(); toast("Achat enregistré."); }
  });
}

function openIdeaDetail(ideaId) {
  const idea = state.purchaseIdeas.find((candidate) => candidate.id === ideaId);
  if (!idea) return;
  const price = idea.targetPrice ? (idea.currency === "EUR" ? euro.format(idea.targetPrice) : real.format(idea.targetPrice)) : "Pas de prix cible";
  formContent.innerHTML = `${formHeader("ACHAT À DÉCIDER", idea.title)}<div class="sheet-body"><span class="idea-status is-${esc(idea.status)}">${esc(ideaStatusLabel[idea.status])}</span><div class="balance-value" style="font-size:42px;margin-top:18px">${esc(price)}</div><p class="balance-copy">Avis : ${idea.opinion === "for" ? "pour" : "à discuter"}.</p>${idea.note ? `<section class="form-section"><p class="form-section-title">NOTE</p><p class="balance-copy">${esc(idea.note)}</p></section>` : ""}${safeUrl(idea.link) ? `<a class="secondary-button" style="margin-top:18px" href="${esc(safeUrl(idea.link))}" target="_blank" rel="noopener noreferrer">Ouvrir le produit <i class="ph ph-arrow-up-right"></i></a>` : ""}</div><div class="form-actions"><button class="danger-button" type="button" data-delete-idea="${esc(idea.id)}">Archiver</button><button class="primary-button" type="button" data-edit-idea="${esc(idea.id)}">Modifier</button></div>`;
  showDialog(formDialog);
}

async function openTaskForm(taskId = "") {
  if (!(await ensureEditAccess())) return;
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  formContent.innerHTML = `${formHeader("APPARTEMENT", task ? "Modifier la tâche" : "Nouvelle tâche")}<form id="task-form"><div class="sheet-body"><div class="field-grid"><label class="field wide"><span class="field-label">Tâche</span><input id="task-title" maxlength="100" value="${esc(task?.title || "")}" required autofocus placeholder="Ex. Appeler le propriétaire" /></label><label class="field"><span class="field-label">Fonctionnement</span><select id="task-type"><option value="simple" ${task?.type !== "rotating" ? "selected" : ""}>Tâche simple</option><option value="rotating" ${task?.type === "rotating" ? "selected" : ""}>À tour de rôle</option></select></label><label class="field"><span class="field-label">Responsable / premier tour</span><select id="task-assignee"><option value="">Non attribué</option>${RESIDENT_IDS.map((id) => `<option value="${id}" ${id === task?.assigneeId ? "selected" : ""}>${esc(memberById(id).name)}</option>`).join("")}</select></label><label class="field"><span class="field-label">Échéance</span><input id="task-date" type="date" value="${esc(task?.dueDate || "")}" /></label><label class="field"><span class="field-label">Répétition</span><select id="task-recurrence"><option value="none" ${!task?.recurrence || task?.recurrence === "none" ? "selected" : ""}>Aucune</option><option value="as-needed" ${task?.recurrence === "as-needed" ? "selected" : ""}>Quand nécessaire</option><option value="weekly" ${task?.recurrence === "weekly" ? "selected" : ""}>Chaque semaine</option><option value="monthly" ${task?.recurrence === "monthly" ? "selected" : ""}>Chaque mois</option></select></label><label class="field wide"><span class="field-label">Note</span><textarea id="task-note" maxlength="500" placeholder="Facultatif">${esc(task?.note || "")}</textarea></label></div></div><div class="form-actions"><button class="secondary-button" type="button" data-dialog-close>Annuler</button><button class="primary-button accent" type="submit">Enregistrer</button></div></form>`;
  showDialog(formDialog);
  $("#task-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const now = isoNow();
    const type = $("#task-type").value;
    const next = { id: task?.id || entityId("task"), title: $("#task-title").value.trim(), type, assigneeId: $("#task-assignee").value || (type === "rotating" ? "gaspard" : ""), dueDate: $("#task-date").value, recurrence: $("#task-recurrence").value, note: $("#task-note").value.trim(), completed: task?.completed || false, archived: false, completions: task?.completions || [], createdAt: task?.createdAt || now, updatedAt: now };
    const saved = await mutate(next.assigneeId || "gaspard", task ? "Modification d’une tâche" : "Ajout d’une tâche", (draft) => {
      draft.tasks = [...draft.tasks.filter((candidate) => candidate.id !== next.id), next];
      addActivity(task ? "task-edit" : "task-add", `${next.title} ${task ? "a été modifiée" : "a été ajoutée"}`, "task", next.id, null, next.assigneeId || "gaspard");
    });
    if (saved) { closeDialog(formDialog); currentView = "tasks"; render(); toast("Tâche enregistrée."); }
  });
}

async function completeRotation(taskId) {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return;
  const actorId = task.assigneeId;
  await mutate(actorId, "Tâche tournante terminée", (draft) => {
    const index = draft.tasks.findIndex((candidate) => candidate.id === taskId);
    draft.tasks[index] = completeRotatingTask(draft.tasks[index], actorId, isoNow());
    addActivity("task-rotation", `${memberById(actorId).name} a fait ${task.title} · prochain tour : ${memberById(draft.tasks[index].assigneeId).name}`, "task", taskId, null, actorId);
  });
  toast(`Validé · au tour de ${memberById(actorId === "gaspard" ? "raphael" : "gaspard").name}.`);
}

async function toggleTask(taskId) {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return;
  if (task.type === "rotating") return completeRotation(taskId);
  const completed = !task.completed;
  await mutate(task.assigneeId || "gaspard", completed ? "Tâche terminée" : "Tâche rouverte", (draft) => {
    const target = draft.tasks.find((candidate) => candidate.id === taskId);
    target.completed = completed;
    target.completedAt = completed ? isoNow() : "";
    target.updatedAt = isoNow();
    addActivity("task-complete", `${target.title} ${completed ? "a été terminée" : "a été rouverte"}`, "task", target.id, null, target.assigneeId || "gaspard");
  });
}

function openMenu(button, type, id) {
  $(".context-menu")?.remove();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  const actions = type === "expense"
    ? [["pencil", "Modifier", "edit"], ["copy", "Dupliquer", "duplicate"], ["x-circle", "Annuler", "delete", true]]
    : type === "shopping"
      ? [["pencil", "Modifier", "edit"], ["user", "Pour Gaspard", "assign-gaspard"], ["user", "Pour Raphael", "assign-raphael"], ["star", "Favori", "favorite"], ["archive", "Archiver", "delete", true]]
      : type === "idea"
        ? [["pencil", "Modifier", "edit"], ["archive", "Archiver", "delete", true]]
        : [["pencil", "Modifier", "edit"], ["archive", "Archiver", "delete", true]];
  menu.innerHTML = actions.map(([icon, label, action, danger]) => `<button class="${danger ? "is-danger" : ""}" type="button" data-menu-action="${action}"><i class="ph ph-${icon}"></i>${label}</button>`).join("");
  document.body.append(menu);
  const rect = button.getBoundingClientRect();
  menu.style.left = `${Math.min(innerWidth - 190, Math.max(10, rect.right - 180))}px`;
  menu.style.top = `${Math.min(innerHeight - menu.offsetHeight - 10, rect.bottom + 5)}px`;
  menu.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-menu-action]")?.dataset.menuAction;
    if (!action) return;
    menu.remove();
    if (type === "expense") {
      if (action === "edit") openExpenseForm({ expenseId: id, spaceId: state.expenses.find((item) => item.id === id)?.spaceId });
      if (action === "duplicate") openExpenseForm({ duplicateId: id, spaceId: state.expenses.find((item) => item.id === id)?.spaceId });
      if (action === "delete") cancelExpense(id);
    } else if (type === "shopping") {
      if (action === "edit") openShoppingForm(id);
      if (action.startsWith("assign-")) {
        const assigneeId = action.replace("assign-", "");
        await mutate(assigneeId, "Attribution d’une course", (draft) => {
          const item = draft.shoppingItems.find((candidate) => candidate.id === id);
          item.assigneeId = assigneeId;
          item.updatedAt = isoNow();
          addActivity("shopping-assign", `${item.label} est attribué à ${memberById(assigneeId).name}`, "shopping", id, null, assigneeId);
        });
      }
      if (action === "favorite") await mutate("gaspard", "Favori de courses", (draft) => {
        const item = draft.shoppingItems.find((candidate) => candidate.id === id);
        item.favorite = !item.favorite;
        item.updatedAt = isoNow();
      });
      if (action === "delete") await mutate("gaspard", "Archivage d’une course", (draft) => {
        const item = draft.shoppingItems.find((candidate) => candidate.id === id);
        item.deletedAt = isoNow(); item.updatedAt = isoNow();
      });
    } else if (type === "idea") {
      if (action === "edit") openIdeaForm(id);
      if (action === "delete") await mutate("gaspard", "Archivage d’un achat", (draft) => { const item = draft.purchaseIdeas.find((candidate) => candidate.id === id); item.deletedAt = isoNow(); item.updatedAt = isoNow(); });
    } else {
      if (action === "edit") openTaskForm(id);
      if (action === "delete") await mutate("gaspard", "Archivage d’une tâche", (draft) => { const item = draft.tasks.find((candidate) => candidate.id === id); item.archived = true; item.updatedAt = isoNow(); });
    }
  });
  setTimeout(() => document.addEventListener("click", function close(event) {
    if (!menu.contains(event.target) && event.target !== button) { menu.remove(); document.removeEventListener("click", close); }
  }), 0);
}

function allSearchResults(query) {
  const needle = query.trim().toLocaleLowerCase("fr");
  if (!needle) return [];
  const contains = (...values) => values.some((value) => String(value || "").toLocaleLowerCase("fr").includes(needle));
  return [
    ...state.expenses.filter((item) => !item.deletedAt && contains(item.title, item.category, item.note, memberById(item.payerId).name)).map((item) => ({ kind: "Dépense", title: item.title, meta: `${expenseOriginal(item)} · ${spaceById(item.spaceId).name}`, action: "expense", id: item.id, spaceId: item.spaceId })),
    ...state.shoppingItems.filter((item) => !item.deletedAt && contains(item.label, item.category, item.store)).map((item) => ({ kind: "Course", title: item.label, meta: item.category, action: "shopping", id: item.id })),
    ...state.purchaseIdeas.filter((item) => !item.deletedAt && contains(item.title, item.note)).map((item) => ({ kind: "À décider", title: item.title, meta: ideaStatusLabel[item.status], action: "idea", id: item.id })),
    ...state.tasks.filter((item) => !item.archived && contains(item.title, item.note)).map((item) => ({ kind: "Tâche", title: item.title, meta: item.type === "rotating" ? "À tour de rôle" : dueInfo(item)[0], action: "task", id: item.id })),
    ...state.spaces.filter((item) => item.type === "group" && contains(item.name)).map((item) => ({ kind: "Groupe", title: item.name, meta: `${item.memberIds.length} personnes`, action: "group", id: item.id })),
  ].slice(0, 30);
}

function renderSearchResults(query = "") {
  const results = allSearchResults(query);
  $("#search-results").innerHTML = query
    ? (results.length ? results.map((result) => `<button class="search-row" type="button" data-search-action="${result.action}" data-id="${esc(result.id)}" data-space-id="${esc(result.spaceId || "")}"><span class="row-copy"><span class="search-kind">${esc(result.kind)}</span><b>${esc(result.title)}</b><small>${esc(result.meta || "")}</small></span><i class="ph ph-arrow-up-right"></i></button>`).join("") : emptyState("magnifying-glass", "Aucun résultat", "Essaie un autre mot."))
    : `<div class="empty-state compact"><div><i class="ph ph-magnifying-glass"></i><h3>Recherche globale</h3><p>Dépenses, achats, tâches et groupes au même endroit.</p></div></div>`;
}

function openSearch() {
  renderSearchResults("");
  showDialog(searchDialog);
  $("#global-search").value = "";
  setTimeout(() => $("#global-search").focus(), 40);
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderSettings() {
  $("#settings-content").innerHTML = `<div class="settings-section"><h3>Apparence</h3><div class="settings-row"><div><b>Thème</b><small>Sombre par défaut, clair si nécessaire.</small></div><div class="theme-control"><button class="${state.preferences.theme !== "light" ? "is-active" : ""}" type="button" data-theme-choice="dark">Sombre</button><button class="${state.preferences.theme === "light" ? "is-active" : ""}" type="button" data-theme-choice="light">Clair</button></div></div></div>
    <div class="settings-section"><h3>Rappels activables</h3>${[["listNotifications", "Liste modifiée", "Seulement quand l’autre l’a choisi."], ["taskNotifications", "Tâche assignée", "Pour les vraies échéances."], ["settlementNotifications", "Solde à régler", "Selon le seuil ci-dessous."]].map(([key, label, copy]) => `<label class="toggle-row"><span><b>${label}</b><small>${copy}</small></span><span class="switch"><input type="checkbox" data-preference="${key}" ${state.preferences[key] ? "checked" : ""}/><span></span></span></label>`).join("")}<label class="field" style="margin-top:12px"><span class="field-label">Seuil de rappel en €</span><input id="settlement-threshold" type="number" min="0" step="5" value="${esc(state.preferences.settlementThreshold || 20)}" /></label></div>
    <div class="settings-section"><h3>Données</h3><div class="settings-actions"><button class="secondary-button" type="button" data-export-csv><i class="ph ph-file-csv"></i> Comptes CSV</button><button class="secondary-button" type="button" data-export-json><i class="ph ph-file-code"></i> Archive JSON</button><button class="quiet-button" type="button" data-sync-now><i class="ph ph-arrows-clockwise"></i> Synchroniser</button><button class="quiet-button" type="button" data-forget-code><i class="ph ph-lock-key-open"></i> Oublier le code</button></div></div>
    <div class="settings-section"><h3>À propos</h3><div class="settings-row"><div><b>Tricount Brazil</b><small>Gaspard + Raphael · Appartement · août–décembre 2026</small></div><span class="group-status is-open">v1</span></div><button class="quiet-button" style="width:100%" type="button" data-open-help>Aide : monnaie, taux, invités et accès</button></div>`;
}

function openSettings() {
  renderSettings();
  showDialog(settingsDialog);
}

function openRecurringReview() {
  const due = recurringDue();
  formContent.innerHTML = `${formHeader("À CONFIRMER", "Dépenses récurrentes")}<div class="sheet-body"><p class="sheet-intro">Une récurrence prépare un brouillon ; elle ne crée jamais une charge automatiquement.</p><ul class="data-list">${due.map((item) => {
    return `<li class="data-row"><span class="row-copy"><b>${esc(item.title)}</b><small>Prévue le ${displayFullDate(item.nextDate)}</small></span><button class="mini-button" type="button" data-confirm-recurrence="${esc(item.id)}" data-source-expense="${esc(item.sourceExpenseId)}">Confirmer</button></li>`;
  }).join("")}</ul></div>`;
  showDialog(formDialog);
}

async function confirmRecurrence(recurringId, sourceExpenseId) {
  const recurring = state.recurringExpenses.find((item) => item.id === recurringId);
  const source = state.expenses.find((item) => item.id === sourceExpenseId);
  if (!recurring || !source) return;
  closeDialog(formDialog);
  await openExpenseForm({ duplicateId: sourceExpenseId, spaceId: source.spaceId });
  $("#expense-title").value = source.title;
}

function shoppingPaidDraft() {
  const items = checkedShoppingItems().slice(0, 20);
  openExpenseForm({
    spaceId: APARTMENT_ID,
    draft: {
      title: "Courses",
      category: "Courses",
      note: items.map((item) => `${item.label}${item.quantity ? ` (${item.quantity})` : ""}`).join(", "),
      currency: state.preferences.lastCurrency || "BRL",
    },
  });
}

root.addEventListener("submit", async (event) => {
  if (event.target.id !== "shopping-quick-form") return;
  event.preventDefault();
  const input = $("#shopping-quick-input");
  await addShoppingItem(input.value);
});

root.addEventListener("change", (event) => {
  if (!event.target.matches("[data-expense-filter-select]")) return;
  expenseFilter = event.target.value;
  expenseExpanded = false;
  render();
});

root.addEventListener("click", async (event) => {
  const target = event.target.closest("button, [data-group-id], [data-person-id], [data-idea-id]");
  if (!target) return;
  if (target.dataset.menu) { event.stopPropagation(); return openMenu(target, target.dataset.menu, target.dataset.id); }
  if (target.dataset.expenseId) return openExpenseDetail(target.dataset.expenseId);
  if (target.dataset.personId) return openPersonDetail(target.dataset.personId, target.dataset.spaceId);
  if (target.dataset.groupId) { currentSpaceId = target.dataset.groupId; groupTab = "expenses"; setView("accounts", { spaceId: currentSpaceId }); return; }
  if (target.dataset.ideaId) return openIdeaDetail(target.dataset.ideaId);
  if (target.dataset.action === "expense") return openExpenseForm({ spaceId: currentSpaceId });
  if (target.dataset.action === "new-group" || target.hasAttribute("data-new-group")) return openGroupForm();
  if (target.dataset.action === "new-idea" || target.hasAttribute("data-new-idea")) return openIdeaForm();
  if (target.dataset.action === "task") return openTaskForm();
  if (target.dataset.expenseFilter) { expenseFilter = target.dataset.expenseFilter; expenseExpanded = false; render(); return; }
  if (target.hasAttribute("data-toggle-expenses")) { expenseExpanded = !expenseExpanded; render(); return; }
  if (target.hasAttribute("data-back-apartment")) { currentSpaceId = APARTMENT_ID; setView("accounts"); return; }
  if (target.dataset.groupTab) { groupTab = target.dataset.groupTab; render(); return; }
  if (target.hasAttribute("data-add-guest")) return openGuestForm();
  if (target.hasAttribute("data-close-group")) return closeGroupReview();
  if (target.hasAttribute("data-reopen-group")) return reopenGroup();
  if (target.hasAttribute("data-copy-group-summary")) return copyGroupSummary();
  if (target.dataset.settleSpace) return openSettlementForm({ spaceId: target.dataset.settleSpace, fromId: target.dataset.from, toId: target.dataset.to, amountEur: Number(target.dataset.amount) });
  if (target.dataset.listTab) { listTab = target.dataset.listTab; history.replaceState(null, "", listTab === "ideas" ? "#lists-decisions" : "#lists"); render(); return; }
  if (target.dataset.shoppingSuggestion) return addShoppingItem(target.dataset.shoppingSuggestion);
  if (target.dataset.toggleShopping) return toggleShopping(target.dataset.toggleShopping);
  if (target.hasAttribute("data-shopping-paid")) return shoppingPaidDraft();
  if (target.dataset.completeRotation) return completeRotation(target.dataset.completeRotation);
  if (target.dataset.toggleTask) return toggleTask(target.dataset.toggleTask);
  if (target.hasAttribute("data-review-recurrences")) return openRecurringReview();
});

document.addEventListener("click", async (event) => {
  const close = event.target.closest("[data-dialog-close]");
  if (close) {
    const dialog = close.closest("dialog");
    closeDialog(dialog);
    return;
  }
  const nav = event.target.closest("[data-view]");
  if (nav) return setView(nav.dataset.view);
  if (event.target.closest("#desktop-add, #mobile-add")) {
    if (currentView === "accounts") return openExpenseForm({ spaceId: currentSpaceId });
    if (currentView === "tasks") return openTaskForm();
    if (listTab === "ideas") return openIdeaForm();
    $("#shopping-quick-input")?.focus();
    return;
  }
  if (event.target.closest("#search-open, #mobile-search-open")) return openSearch();
  if (event.target.closest("#settings-open, #mobile-settings-open")) return openSettings();
  if (event.target.closest("#help-open")) return showDialog(helpDialog);
  if (event.target.closest("#sync-button, #sync-pill")) return syncPending("Synchronisation manuelle", state.updatedBy);
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action && event.target.closest("#action-dialog")) {
    closeDialog(actionDialog);
    if (action === "expense") return openExpenseForm({ spaceId: currentSpaceId });
    if (action === "purchase") return openPurchaseChooser();
    if (action === "task") return openTaskForm();
  }
  const editExpense = event.target.closest("[data-edit-expense]");
  if (editExpense) { closeDialog(formDialog); return openExpenseForm({ expenseId: editExpense.dataset.editExpense, spaceId: state.expenses.find((item) => item.id === editExpense.dataset.editExpense)?.spaceId }); }
  const duplicateExpense = event.target.closest("[data-duplicate-expense]");
  if (duplicateExpense) { closeDialog(formDialog); return openExpenseForm({ duplicateId: duplicateExpense.dataset.duplicateExpense, spaceId: state.expenses.find((item) => item.id === duplicateExpense.dataset.duplicateExpense)?.spaceId }); }
  const cancel = event.target.closest("[data-cancel-expense]");
  if (cancel) return cancelExpense(cancel.dataset.cancelExpense);
  const restore = event.target.closest("[data-restore-expense]");
  if (restore) return restoreExpense(restore.dataset.restoreExpense);
  const editIdea = event.target.closest("[data-edit-idea]");
  if (editIdea) { closeDialog(formDialog); return openIdeaForm(editIdea.dataset.editIdea); }
  const deleteIdea = event.target.closest("[data-delete-idea]");
  if (deleteIdea) { closeDialog(formDialog); return mutate("gaspard", "Archivage d’un achat", (draft) => { const item = draft.purchaseIdeas.find((candidate) => candidate.id === deleteIdea.dataset.deleteIdea); item.deletedAt = isoNow(); item.updatedAt = isoNow(); }); }
  const recurrence = event.target.closest("[data-confirm-recurrence]");
  if (recurrence) return confirmRecurrence(recurrence.dataset.confirmRecurrence, recurrence.dataset.sourceExpense);
});

$("#global-search").addEventListener("input", (event) => renderSearchResults(event.target.value));
$("#search-results").addEventListener("click", (event) => {
  const row = event.target.closest("[data-search-action]");
  if (!row) return;
  closeDialog(searchDialog);
  if (row.dataset.searchAction === "expense") { currentView = "accounts"; currentSpaceId = row.dataset.spaceId || APARTMENT_ID; render(); openExpenseDetail(row.dataset.id); }
  if (row.dataset.searchAction === "shopping") { currentView = "lists"; listTab = "shopping"; render(); openShoppingForm(row.dataset.id); }
  if (row.dataset.searchAction === "idea") { currentView = "lists"; listTab = "ideas"; render(); openIdeaDetail(row.dataset.id); }
  if (row.dataset.searchAction === "task") { currentView = "tasks"; render(); openTaskForm(row.dataset.id); }
  if (row.dataset.searchAction === "group") { currentSpaceId = row.dataset.id; setView("accounts", { spaceId: row.dataset.id }); }
});

$("#settings-content").addEventListener("change", async (event) => {
  if (event.target.dataset.preference) {
    const key = event.target.dataset.preference;
    if (event.target.checked && "Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch { /* The in-app reminder remains available. */ }
    }
    await mutate("gaspard", "Mise à jour des rappels", (draft) => { draft.preferences[key] = event.target.checked; });
    renderSettings();
  }
  if (event.target.id === "settlement-threshold") {
    await mutate("gaspard", "Mise à jour du seuil", (draft) => { draft.preferences.settlementThreshold = Math.max(0, Number(event.target.value) || 0); });
  }
});

$("#settings-content").addEventListener("click", async (event) => {
  const theme = event.target.closest("[data-theme-choice]");
  if (theme) {
    state.preferences.theme = theme.dataset.themeChoice;
    cacheState();
    markPending();
    render();
    renderSettings();
    void syncPending("Changement de thème", "gaspard");
    return;
  }
  if (event.target.closest("[data-export-csv]")) download(`tricount-brazil-comptes-${todayIso()}.csv`, expenseCsv(state.expenses, state.members, state.spaces), "text/csv;charset=utf-8");
  if (event.target.closest("[data-export-json]")) download(`tricount-brazil-archive-${todayIso()}.json`, JSON.stringify(state, null, 2), "application/json");
  if (event.target.closest("[data-sync-now]")) syncPending("Synchronisation manuelle", state.updatedBy);
  if (event.target.closest("[data-forget-code]")) {
    lockApp("Le code a été oublié. Entre-le à nouveau pour ouvrir l’espace.", { clearCode: true });
  }
  if (event.target.closest("[data-open-help]")) { closeDialog(settingsDialog); showDialog(helpDialog); }
});

document.addEventListener("keydown", (event) => {
  if (appUnlocked && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSearch();
  }
  if (event.key === "Escape") $(".context-menu")?.remove();
});

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = accessCodeInput.value.trim();
  accessError.hidden = true;
  if (!/^\d{4}$/.test(code)) {
    accessError.textContent = "Entre exactement quatre chiffres.";
    accessError.hidden = false;
    accessCodeInput.focus();
    return;
  }
  setAccessBusy(true, "Vérification sécurisée…");
  try {
    const row = await verifyAccessCode(code);
    unlockApp(code, { row });
  } catch (error) {
    accessError.textContent = error.message || "Impossible de vérifier le code.";
    accessError.hidden = false;
    setAccessBusy(false, "Vérifie ta connexion puis réessaie.");
  }
});

window.addEventListener("online", () => { if (appUnlocked) void syncPending("Retour en ligne", state.updatedBy); });
window.addEventListener("offline", () => setSync("offline", "Hors ligne"));
window.addEventListener("focus", () => {
  if (appUnlocked && Date.now() - lastSyncAt > 5000) void syncPending();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") clearTimeout(syncTimer);
  else if (appUnlocked && Date.now() - lastSyncAt > 5000) void syncPending();
  else scheduleSync();
});
window.addEventListener("storage", (event) => {
  if (event.key === CACHE_KEY && event.newValue && !isSaving) {
    state = normalizeState(parse(event.newValue) || state);
    baseState = normalizeState(parse(localStorage.getItem(BASE_KEY)) || baseState);
    remoteVersion = Number(localStorage.getItem(VERSION_KEY)) || remoteVersion;
    if (appUnlocked) render();
  }
});
window.addEventListener("hashchange", () => { if (appUnlocked) { parseHash(); render(); } });

if (!useLocalDemo) registerPwa({ onUpdate: (activate) => toast("Nouvelle version prête", "success", { label: "Actualiser", run: activate }) });

void bootstrapAccess();
