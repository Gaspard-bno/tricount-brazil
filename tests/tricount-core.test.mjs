import assert from "node:assert/strict";
import test from "node:test";
import {
  APARTMENT_ID,
  TRIP_ID,
  calculateBalances,
  calculateShares,
  completeRotatingTask,
  convertToEur,
  createInitialState,
  filterExpensesByPeriod,
  normalizeState,
  suggestSettlements,
  threeWayMerge,
} from "../docs/core.js";

function expense(overrides = {}) {
  return {
    id: "expense-1",
    spaceId: APARTMENT_ID,
    title: "Courses",
    category: "Courses",
    payerId: "gaspard",
    participantIds: ["gaspard", "raphael"],
    amountOriginal: 120,
    currency: "BRL",
    amountEur: 20,
    exchangeRate: 6,
    exchangeRateDate: "2026-08-29",
    exchangeRateSource: "Frankfurter / BCE",
    splitMode: "equal",
    shares: [
      { memberId: "gaspard", amountEur: 10 },
      { memberId: "raphael", amountEur: 10 },
    ],
    date: "2026-08-29",
    createdAt: "2026-08-29T12:00:00.000Z",
    updatedAt: "2026-08-29T12:00:00.000Z",
    ...overrides,
  };
}

test("Brazil starts isolated from Marseille with exact permanent names", () => {
  const state = createInitialState("2026-08-29T00:00:00.000Z");
  assert.equal(state.tripId, TRIP_ID);
  assert.equal(state.tripId, "tricount-brazil-2026");
  assert.deepEqual(state.members.map(({ name }) => name), ["Gaspard", "Raphael"]);
  assert.equal(state.expenses.length, 0);
  assert.deepEqual(state.tasks.map(({ title }) => title), [
    "Machine à laver",
    "Descendre les poubelles",
    "Ménage de l’appartement",
  ]);
  const corrected = normalizeState({
    ...state,
    members: state.members.map((member) => ({ ...member, name: member.id === "raphael" ? "Raphaël" : member.name })),
  });
  assert.deepEqual(corrected.members.map(({ name }) => name), ["Gaspard", "Raphael"]);
});

test("R$ 120 is frozen in euros and split 50/50", () => {
  const conversion = convertToEur({ amountOriginal: 120, currency: "BRL", exchangeRate: 6 });
  assert.deepEqual(conversion, {
    amountEur: 20,
    exchangeRate: 6,
    conversionMode: "reference",
  });
  const state = createInitialState();
  state.expenses.push(expense());
  const result = calculateBalances(state);
  assert.equal(result.balances.gaspard, 10);
  assert.equal(result.balances.raphael, -10);
  assert.deepEqual(suggestSettlements(result.balances), [
    { fromId: "raphael", toId: "gaspard", amountEur: 10 },
  ]);
});

test("a bank statement can override the reference conversion", () => {
  assert.deepEqual(
    convertToEur({ amountOriginal: 120, currency: "BRL", exchangeRate: 6, manualAmountEur: 20.31 }),
    { amountEur: 20.31, exchangeRate: 5.91, conversionMode: "manual-bank" },
  );
});

test("an EUR expense uses rate 1 without conversion", () => {
  assert.deepEqual(convertToEur({ amountOriginal: 42.18, currency: "EUR" }), {
    amountEur: 42.18,
    exchangeRate: 1,
    conversionMode: "native-eur",
  });
});

test("advanced exact and percentage splits remain cent-accurate", () => {
  assert.deepEqual(
    calculateShares({
      amountEur: 20,
      participantIds: ["gaspard", "raphael"],
      mode: "exact",
      values: { gaspard: 4.5, raphael: 15.5 },
    }),
    [
      { memberId: "gaspard", amountEur: 4.5 },
      { memberId: "raphael", amountEur: 15.5 },
    ],
  );
  assert.deepEqual(
    calculateShares({
      amountEur: 10,
      participantIds: ["gaspard", "raphael"],
      mode: "percent",
      values: { gaspard: 33.33, raphael: 66.67 },
    }),
    [
      { memberId: "gaspard", amountEur: 3.33 },
      { memberId: "raphael", amountEur: 6.67 },
    ],
  );
  assert.throws(
    () => calculateShares({
      amountEur: 20,
      participantIds: ["gaspard", "raphael"],
      mode: "exact",
      values: { gaspard: -1, raphael: 21 },
    }),
    /négatives/,
  );
});

test("a four-person event handles subgroups and minimal settlement", () => {
  const state = createInitialState();
  state.members.push(
    { id: "ana", name: "Ana", type: "guest" },
    { id: "joao", name: "João", type: "guest" },
  );
  state.spaces.push({
    id: "group-dinner",
    name: "Dîner à l’appartement",
    type: "group",
    status: "open",
    memberIds: ["gaspard", "raphael", "ana", "joao"],
  });
  state.expenses.push(
    expense({
      id: "dinner",
      spaceId: "group-dinner",
      amountOriginal: 80,
      currency: "EUR",
      amountEur: 80,
      payerId: "gaspard",
      participantIds: ["gaspard", "raphael", "ana", "joao"],
      shares: calculateShares({ amountEur: 80, participantIds: ["gaspard", "raphael", "ana", "joao"] }),
    }),
    expense({
      id: "taxi",
      spaceId: "group-dinner",
      amountOriginal: 20,
      currency: "EUR",
      amountEur: 20,
      payerId: "joao",
      participantIds: ["ana", "joao"],
      shares: calculateShares({ amountEur: 20, participantIds: ["ana", "joao"] }),
    }),
  );
  const { balances } = calculateBalances(state, "group-dinner");
  const settlements = suggestSettlements(balances);
  assert.equal(settlements.length, 3);
  assert.equal(settlements.reduce((sum, item) => sum + item.amountEur, 0), 60);
});

test("rotating tasks alternate and preserve their activity", () => {
  const state = createInitialState("2026-08-29T00:00:00.000Z");
  const afterGaspard = completeRotatingTask(state.tasks[0], "gaspard", "2026-08-29T10:00:00.000Z");
  assert.equal(afterGaspard.assigneeId, "raphael");
  assert.equal(afterGaspard.completions[0].byId, "gaspard");
  const afterRaphael = completeRotatingTask(afterGaspard, "raphael", "2026-08-30T10:00:00.000Z");
  assert.equal(afterRaphael.assigneeId, "gaspard");
  assert.deepEqual(afterRaphael.completions.map(({ byId }) => byId), ["raphael", "gaspard"]);
});

test("period filters cover today, yesterday, week, current and specific month", () => {
  const now = new Date("2026-09-03T12:00:00");
  const expenses = [
    expense({ id: "today", date: "2026-09-03" }),
    expense({ id: "yesterday", date: "2026-09-02" }),
    expense({ id: "august", date: "2026-08-31" }),
    expense({ id: "october", date: "2026-10-02" }),
  ];
  assert.deepEqual(filterExpensesByPeriod(expenses, "today", now).map(({ id }) => id), ["today"]);
  assert.deepEqual(filterExpensesByPeriod(expenses, "yesterday", now).map(({ id }) => id), ["yesterday"]);
  assert.deepEqual(filterExpensesByPeriod(expenses, "week", now).map(({ id }) => id), ["today", "yesterday", "august"]);
  assert.deepEqual(filterExpensesByPeriod(expenses, "month", now).map(({ id }) => id), ["today", "yesterday"]);
  assert.deepEqual(filterExpensesByPeriod(expenses, "month-08", now).map(({ id }) => id), ["august"]);
});

test("offline merge combines distinct edits and surfaces same-line conflicts", () => {
  const base = createInitialState("2026-08-29T00:00:00.000Z");
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.shoppingItems.push({ id: "coffee", label: "Café", updatedAt: "2026-08-29T10:00:00.000Z" });
  remote.tasks[0] = { ...remote.tasks[0], note: "Cycle délicat", updatedAt: "2026-08-29T11:00:00.000Z" };
  const distinct = threeWayMerge(base, local, remote);
  assert.equal(distinct.conflicts.length, 0);
  assert.equal(distinct.state.shoppingItems[0].label, "Café");
  assert.equal(distinct.state.tasks[0].note, "Cycle délicat");

  const common = createInitialState();
  common.expenses.push(expense());
  const mine = structuredClone(common);
  const theirs = structuredClone(common);
  mine.expenses[0].title = "Courses Condor";
  theirs.expenses[0].title = "Courses Festval";
  const conflict = threeWayMerge(common, mine, theirs);
  assert.equal(conflict.conflicts.length, 1);
  assert.equal(conflict.conflicts[0].key, "expenses");
});
