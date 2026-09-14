export const TRIP_ID = "tricount-brazil-2026";
export const APARTMENT_ID = "apartment";
export const RESIDENT_IDS = ["gaspard", "raphael"];
export const SCHEMA_VERSION = 3;

export const roundMoney = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export const entityId = (prefix = "item") =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.floor(Math.random() * 1e9)}`}`;

export function createInitialState(now = new Date().toISOString()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    tripId: TRIP_ID,
    members: [
      {
        id: "gaspard",
        name: "Gaspard",
        initial: "G",
        type: "resident",
        color: "yellow",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "raphael",
        name: "Raphael",
        initial: "R",
        type: "resident",
        color: "blue",
        createdAt: now,
        updatedAt: now,
      },
    ],
    spaces: [
      {
        id: APARTMENT_ID,
        name: "Appartement",
        type: "apartment",
        status: "open",
        currency: "BRL",
        memberIds: [...RESIDENT_IDS],
        createdAt: now,
        updatedAt: now,
      },
    ],
    expenses: [],
    settlements: [],
    shoppingItems: [],
    purchaseIdeas: [],
    tasks: [
      rotatingTask("task-laundry", "Machine à laver", "gaspard", now),
      rotatingTask("task-trash", "Descendre les poubelles", "raphael", now),
      rotatingTask("task-cleaning", "Ménage de l’appartement", "gaspard", now),
    ],
    recurringExpenses: [],
    activity: [],
    preferences: {
      lastPayerId: "gaspard",
      lastCurrency: "BRL",
      settlementThreshold: 20,
      theme: "dark",
      listNotifications: false,
      taskNotifications: false,
      settlementNotifications: false,
      favoriteShopping: ["Café", "Lessive", "Papier toilette", "Eau"],
      recentExpenseLabels: [],
    },
    updatedAt: now,
    updatedBy: "Initialisation",
  };
}

function rotatingTask(id, title, assigneeId, now) {
  return {
    id,
    title,
    type: "rotating",
    assigneeId,
    dueDate: "",
    recurrence: "as-needed",
    note: "",
    completed: false,
    archived: false,
    completions: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeState(input) {
  const fallback = createInitialState();
  if (!input || typeof input !== "object" || Array.isArray(input)) return fallback;
  const array = (key) => (Array.isArray(input[key]) ? input[key] : fallback[key]);
  const members = array("members").map((member) => {
    const permanent = fallback.members.find((candidate) => candidate.id === member?.id);
    return permanent
      ? { ...member, name: permanent.name, initial: permanent.initial, type: "resident", color: permanent.color }
      : member;
  });
  const missingResidents = fallback.members.filter((resident) =>
    !members.some((member) => member?.id === resident.id),
  );
  const spaces = array("spaces");
  return {
    ...fallback,
    ...input,
    schemaVersion: SCHEMA_VERSION,
    tripId: TRIP_ID,
    members: [...members, ...missingResidents],
    spaces: spaces.some((space) => space?.id === APARTMENT_ID)
      ? spaces
      : [...fallback.spaces, ...spaces],
    expenses: array("expenses"),
    settlements: array("settlements"),
    shoppingItems: array("shoppingItems"),
    purchaseIdeas: array("purchaseIdeas"),
    tasks: Array.isArray(input.tasks) ? input.tasks : fallback.tasks,
    recurringExpenses: array("recurringExpenses"),
    activity: array("activity").slice(0, 300),
    preferences: { ...fallback.preferences, ...(input.preferences || {}) },
  };
}

export function convertToEur({ amountOriginal, currency, exchangeRate, manualAmountEur }) {
  const original = Number(amountOriginal);
  if (!Number.isFinite(original) || original <= 0) {
    throw new Error("Le montant doit être supérieur à zéro.");
  }
  if (currency === "EUR") {
    return {
      amountEur: roundMoney(original),
      exchangeRate: 1,
      conversionMode: "native-eur",
    };
  }
  if (currency !== "BRL") throw new Error("Devise non prise en charge.");
  const bankAmount = Number(manualAmountEur);
  if (Number.isFinite(bankAmount) && bankAmount > 0) {
    return {
      amountEur: roundMoney(bankAmount),
      exchangeRate: roundMoney(original / bankAmount),
      conversionMode: "manual-bank",
    };
  }
  const rate = Number(exchangeRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Un taux EUR/BRL valide est nécessaire.");
  }
  return {
    amountEur: roundMoney(original / rate),
    exchangeRate: rate,
    conversionMode: "reference",
  };
}

export function calculateShares({ amountEur, participantIds, mode = "equal", values = {} }) {
  const total = roundMoney(amountEur);
  const ids = [...new Set(participantIds || [])].filter(Boolean);
  if (!ids.length) throw new Error("Choisis au moins une personne.");
  if (!Number.isFinite(total) || !(total > 0)) throw new Error("Le montant converti doit être positif.");

  if (mode === "equal") {
    const cents = Math.round(total * 100);
    const base = Math.floor(cents / ids.length);
    const remainder = cents % ids.length;
    return ids.map((memberId, index) => ({
      memberId,
      amountEur: (base + (index < remainder ? 1 : 0)) / 100,
    }));
  }

  if (mode === "exact") {
    const shares = ids.map((memberId) => ({
      memberId,
      amountEur: roundMoney(Number(values[memberId]) || 0),
    }));
    if (shares.some((share) => !Number.isFinite(share.amountEur) || share.amountEur < 0)) {
      throw new Error("Les parts ne peuvent pas être négatives.");
    }
    const sum = roundMoney(shares.reduce((acc, share) => acc + share.amountEur, 0));
    if (sum !== total) {
      throw new Error(`Les montants doivent totaliser ${total.toFixed(2)} €.`);
    }
    return shares;
  }

  if (mode === "percent") {
    const percentages = ids.map((memberId) => Number(values[memberId]) || 0);
    if (percentages.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error("Les pourcentages ne peuvent pas être négatifs.");
    }
    const sum = roundMoney(percentages.reduce((acc, value) => acc + value, 0));
    if (sum !== 100) {
      throw new Error("Les pourcentages doivent totaliser 100 %.");
    }
    const cents = Math.round(total * 100);
    const raw = percentages.map((percentage) => cents * percentage / 100);
    const allocated = raw.map(Math.floor);
    let remaining = cents - allocated.reduce((sum, amount) => sum + amount, 0);
    const order = raw.map((amount, index) => ({ index, remainder: amount - allocated[index] }))
      .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
    for (const { index } of order) {
      if (remaining <= 0) break;
      allocated[index] += 1;
      remaining -= 1;
    }
    return ids.map((memberId, index) => ({ memberId, amountEur: allocated[index] / 100 }));
  }

  throw new Error("Mode de partage inconnu.");
}

export function calculateBalances(state, spaceId = APARTMENT_ID) {
  const normalized = normalizeState(state);
  const space = normalized.spaces.find((item) => item.id === spaceId);
  const memberIds = new Set(space?.memberIds || RESIDENT_IDS);
  normalized.expenses
    .filter((expense) => expense.spaceId === spaceId && !expense.deletedAt)
    .forEach((expense) => {
      memberIds.add(expense.payerId);
      (expense.shares || []).forEach((share) => memberIds.add(share.memberId));
    });

  const paid = Object.fromEntries([...memberIds].map((id) => [id, 0]));
  const owed = Object.fromEntries([...memberIds].map((id) => [id, 0]));
  const expenses = normalized.expenses.filter(
    (expense) => expense.spaceId === spaceId && !expense.deletedAt,
  );

  for (const expense of expenses) {
    const amount = roundMoney(expense.amountEur);
    paid[expense.payerId] = roundMoney((paid[expense.payerId] || 0) + amount);
    const shares = Array.isArray(expense.shares) && expense.shares.length
      ? expense.shares
      : calculateShares({
          amountEur: amount,
          participantIds: expense.participantIds || [...memberIds],
        });
    for (const share of shares) {
      owed[share.memberId] = roundMoney((owed[share.memberId] || 0) + Number(share.amountEur));
    }
  }

  const balances = Object.fromEntries(
    [...memberIds].map((id) => [id, roundMoney((paid[id] || 0) - (owed[id] || 0))]),
  );
  const settlements = normalized.settlements.filter(
    (settlement) => settlement.spaceId === spaceId && !settlement.deletedAt,
  );
  for (const settlement of settlements) {
    const amount = roundMoney(settlement.amountEur);
    balances[settlement.fromId] = roundMoney((balances[settlement.fromId] || 0) + amount);
    balances[settlement.toId] = roundMoney((balances[settlement.toId] || 0) - amount);
  }

  return {
    paid,
    owed,
    balances,
    totalEur: roundMoney(expenses.reduce((sum, expense) => sum + Number(expense.amountEur), 0)),
    expenseCount: expenses.length,
  };
}

export function suggestSettlements(balanceMap) {
  const debtors = Object.entries(balanceMap)
    .filter(([, amount]) => amount < -0.005)
    .map(([memberId, amount]) => ({ memberId, amount: roundMoney(-amount) }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = Object.entries(balanceMap)
    .filter(([, amount]) => amount > 0.005)
    .map(([memberId, amount]) => ({ memberId, amount: roundMoney(amount) }))
    .sort((a, b) => b.amount - a.amount);
  const suggestions = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const amount = roundMoney(
      Math.min(debtors[debtorIndex].amount, creditors[creditorIndex].amount),
    );
    if (amount > 0) {
      suggestions.push({
        fromId: debtors[debtorIndex].memberId,
        toId: creditors[creditorIndex].memberId,
        amountEur: amount,
      });
    }
    debtors[debtorIndex].amount = roundMoney(debtors[debtorIndex].amount - amount);
    creditors[creditorIndex].amount = roundMoney(creditors[creditorIndex].amount - amount);
    if (debtors[debtorIndex].amount < 0.005) debtorIndex += 1;
    if (creditors[creditorIndex].amount < 0.005) creditorIndex += 1;
  }
  return suggestions;
}

export function completeRotatingTask(task, completedBy, at = new Date().toISOString()) {
  if (!task || task.type !== "rotating") throw new Error("Cette tâche n’est pas tournante.");
  if (!RESIDENT_IDS.includes(completedBy)) throw new Error("Exécutant inconnu.");
  const nextAssigneeId = completedBy === "gaspard" ? "raphael" : "gaspard";
  return {
    ...task,
    assigneeId: nextAssigneeId,
    lastCompletedBy: completedBy,
    lastCompletedAt: at,
    completed: false,
    completions: [
      { id: entityId("completion"), byId: completedBy, at },
      ...(task.completions || []),
    ].slice(0, 60),
    updatedAt: at,
  };
}

function localDate(value) {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function filterExpensesByPeriod(expenses, filter = "all", now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const monday = new Date(today);
  const day = (today.getDay() + 6) % 7;
  monday.setDate(today.getDate() - day);
  const specificMonth = /^month-(0[89]|1[0-2])$/.exec(filter);
  return (expenses || []).filter((expense) => {
    if (expense.deletedAt) return false;
    const date = localDate(expense.date || expense.createdAt);
    if (!date || filter === "all") return true;
    if (filter === "today") return sameDay(date, today);
    if (filter === "yesterday") return sameDay(date, yesterday);
    if (filter === "week") return date >= monday && date <= new Date(today.getTime() + 86_399_999);
    if (filter === "month") {
      return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
    }
    if (specificMonth) return date.getMonth() === Number(specificMonth[1]) - 1;
    return true;
  });
}

export function expenseCsv(expenses, members, spaces) {
  const memberName = (id) => members.find((member) => member.id === id)?.name || id;
  const spaceName = (id) => spaces.find((space) => space.id === id)?.name || id;
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [
    ["Date", "Espace", "Titre", "Catégorie", "Payeur", "Montant origine", "Devise", "Montant EUR", "Taux EUR/BRL", "Source", "Participants"],
    ...(expenses || [])
      .filter((expense) => !expense.deletedAt)
      .map((expense) => [
        expense.date,
        spaceName(expense.spaceId),
        expense.title,
        expense.category,
        memberName(expense.payerId),
        expense.amountOriginal,
        expense.currency,
        expense.amountEur,
        expense.exchangeRate,
        expense.exchangeRateSource,
        (expense.participantIds || []).map(memberName).join(" | "),
      ]),
  ];
  return rows.map((row) => row.map(quote).join(",")).join("\n");
}

const COLLECTION_KEYS = [
  "members",
  "spaces",
  "expenses",
  "settlements",
  "shoppingItems",
  "purchaseIdeas",
  "tasks",
  "recurringExpenses",
];

// PostgreSQL JSONB can reorder object keys. Key order is not a local edit.
export function sameValue(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((value, index) => sameValue(value, b[index]));
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) =>
    Object.hasOwn(b, key) && sameValue(a[key], b[key]),
  );
}

const sameJson = sameValue;

function mergeCollection(key, baseItems = [], localItems = [], remoteItems = []) {
  const base = new Map(baseItems.map((item) => [item.id, item]));
  const local = new Map(localItems.map((item) => [item.id, item]));
  const remote = new Map(remoteItems.map((item) => [item.id, item]));
  const ids = new Set([...base.keys(), ...local.keys(), ...remote.keys()]);
  const items = [];
  const conflicts = [];
  for (const id of ids) {
    const before = base.get(id);
    const mine = local.get(id);
    const theirs = remote.get(id);
    const mineChanged = !sameJson(mine, before);
    const theirsChanged = !sameJson(theirs, before);
    if (!mineChanged) {
      if (theirs) items.push(theirs);
      continue;
    }
    if (!theirsChanged || sameJson(mine, theirs)) {
      if (mine) items.push(mine);
      continue;
    }
    conflicts.push({ key, id, base: before || null, local: mine || null, remote: theirs || null });
    if (theirs) items.push(theirs);
  }
  return { items, conflicts };
}

export function threeWayMerge(baseInput, localInput, remoteInput) {
  const base = normalizeState(baseInput);
  const local = normalizeState(localInput);
  const remote = normalizeState(remoteInput);
  const merged = { ...remote };
  const conflicts = [];

  for (const key of COLLECTION_KEYS) {
    const result = mergeCollection(key, base[key], local[key], remote[key]);
    merged[key] = result.items;
    conflicts.push(...result.conflicts);
  }

  const activityMap = new Map(
    [...(remote.activity || []), ...(local.activity || [])].map((item) => [item.id, item]),
  );
  merged.activity = [...activityMap.values()]
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 300);

  const preferenceKeys = new Set([
    ...Object.keys(base.preferences || {}),
    ...Object.keys(local.preferences || {}),
    ...Object.keys(remote.preferences || {}),
  ]);
  merged.preferences = { ...remote.preferences };
  for (const key of preferenceKeys) {
    const before = base.preferences?.[key];
    const mine = local.preferences?.[key];
    const theirs = remote.preferences?.[key];
    if (sameJson(theirs, before) || sameJson(mine, theirs)) merged.preferences[key] = mine;
    else if (!sameJson(mine, before) && !sameJson(theirs, before)) {
      conflicts.push({ key: "preferences", id: key, base: before, local: mine, remote: theirs });
    }
  }
  merged.updatedAt = new Date().toISOString();
  return { state: normalizeState(merged), conflicts };
}

export function resolveMergeConflicts(mergedInput, conflicts, choices = {}) {
  const state = normalizeState(mergedInput);
  for (const conflict of conflicts || []) {
    const choice = choices[`${conflict.key}:${conflict.id}`] || "remote";
    const value = choice === "local" ? conflict.local : conflict.remote;
    if (conflict.key === "preferences") {
      if (value === undefined) delete state.preferences[conflict.id];
      else state.preferences[conflict.id] = value;
      continue;
    }
    state[conflict.key] = state[conflict.key].filter((item) => item.id !== conflict.id);
    if (value) state[conflict.key].push(value);
  }
  return normalizeState(state);
}
