import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState } from "../src/core.js";
import { fetchJsonWithTimeout } from "../src/network.js";
import { createSingleFlight, hasStateChanges, reconcileAck } from "../src/sync-core.js";

test("API requests return JSON and preserve HTTP service error details", async () => {
  assert.deepEqual(await fetchJsonWithTimeout("https://example.test", {}, {
    fetchImpl: async () => new Response('{"version":3}', { status: 200 }),
  }), { version: 3 });
  await assert.rejects(fetchJsonWithTimeout("https://example.test", {}, {
    fetchImpl: async () => new Response('{"message":"Forbidden"}', { status: 403 }),
  }), (error) => error.code === "HTTP_ERROR" && error.status === 403);
});

test("timeout bounds a hanging request even when the implementation ignores AbortSignal", async () => {
  let signal;
  await assert.rejects(fetchJsonWithTimeout("https://example.test", {}, {
    timeoutMs: 15,
    fetchImpl: (_url, init) => { signal = init.signal; return new Promise(() => {}); },
  }), (error) => error.code === "TIMEOUT");
  assert.equal(signal.aborted, true);
});

test("timeout also bounds a stalled response body", async () => {
  await assert.rejects(fetchJsonWithTimeout("https://example.test", {}, {
    timeoutMs: 15,
    fetchImpl: async () => ({ ok: true, status: 200, text: () => new Promise(() => {}) }),
  }), (error) => error.code === "TIMEOUT");
});

test("caller cancellation does not get mislabeled as a timeout", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchJsonWithTimeout("https://example.test", { signal: controller.signal }, {
    fetchImpl: async () => { throw new Error("An aborted request must not be sent"); },
  }), (error) => error.name === "AbortError");
});

test("one sync runs at a time and a rejected run does not poison future syncs", async () => {
  const run = createSingleFlight();
  let resolve;
  let calls = 0;
  const first = run(() => { calls += 1; return new Promise((done) => { resolve = done; }); });
  const second = run(() => { calls += 1; });
  assert.equal(first, second);
  assert.equal(run.isRunning(), true);
  await Promise.resolve();
  resolve("saved");
  assert.equal(await second, "saved");
  assert.equal(calls, 1);
  assert.equal(run.isRunning(), false);
  await assert.rejects(run(() => { throw new Error("offline"); }), /offline/);
  assert.equal(await run(() => "online"), "online");
});

test("acknowledging one expense preserves edits made while the save was in flight", () => {
  const submitted = createInitialState("2026-09-14T00:00:00Z");
  submitted.shoppingItems.push({ id: "coffee", label: "Café", checked: false });
  const current = structuredClone(submitted);
  current.shoppingItems[0].checked = true;
  current.shoppingItems.push({ id: "milk", label: "Lait" });
  const server = structuredClone(submitted);
  server.updatedAt = "2026-09-14T00:00:01Z";
  const ack = reconcileAck(submitted, current, server);
  assert.equal(ack.dirty, true);
  assert.equal(ack.conflicts.length, 0);
  assert.equal(ack.state.shoppingItems[0].checked, true);
  assert.equal(ack.state.shoppingItems[1].label, "Lait");
  assert.equal(hasStateChanges(submitted, server), false);
});

test("an acknowledgement with no newer local edit clears the pending state", () => {
  const submitted = createInitialState("2026-09-14T00:00:00Z");
  const ack = reconcileAck(submitted, structuredClone(submitted), structuredClone(submitted));
  assert.equal(ack.dirty, false);
  assert.equal(ack.conflicts.length, 0);
});

test("PostgreSQL JSONB key ordering does not invent dirty state or a conflict", () => {
  const submitted = createInitialState("2026-09-14T00:00:00Z");
  submitted.shoppingItems = [{ id: "coffee", label: "Café", checked: false }];
  const current = structuredClone(submitted);
  current.shoppingItems[0].checked = true;
  const server = structuredClone(submitted);
  server.shoppingItems = [{ checked: false, label: "Café", id: "coffee" }];
  assert.equal(hasStateChanges(submitted, server), false);
  const ack = reconcileAck(submitted, current, server);
  assert.equal(ack.conflicts.length, 0);
  assert.equal(ack.state.shoppingItems[0].checked, true);
});
