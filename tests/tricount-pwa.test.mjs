import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const runtime = await readFile(new URL("../scripts/service-worker-runtime.js", import.meta.url), "utf8");
const scope = "https://example.test/tricount-brazil/";
const version = "aabbccddeeff1234";
const currentCache = `tricount-brazil-shell-${version}`;
const precache = ["index.html", "assets/index-aabb.js", "assets/index-aabb.css", "manifest.webmanifest", "icon-192.png"];

function workerHarness({ clients = [], fetchImpl = async () => new Response("network"), timerDelay, initialCaches = {} } = {}) {
  const listeners = new Map();
  const cacheMaps = new Map(Object.entries(initialCaches).map(([name, contents]) => [name, new Map(Object.entries(contents))]));
  const messages = [];
  const deleted = [];
  const fetched = [];
  let skipWaitingCalls = 0;
  const cacheFor = async (name) => {
    if (!cacheMaps.has(name)) cacheMaps.set(name, new Map());
    const contents = cacheMaps.get(name);
    return {
      match: async (request) => {
        const response = contents.get(typeof request === "string" ? request : request.url);
        return response?.clone();
      },
      addAll: async (requests) => {
        for (const request of requests) contents.set(request.url, new Response(`cached:${request.url}`));
      },
    };
  };
  const context = vm.createContext({
    URL, Request, Response, AbortController,
    setTimeout: (fn, delay) => setTimeout(fn, timerDelay ?? delay),
    clearTimeout,
    caches: {
      open: cacheFor,
      keys: async () => [...cacheMaps.keys()],
      delete: async (name) => { deleted.push(name); return cacheMaps.delete(name); },
    },
    fetch: async (request, options) => { fetched.push({ request, options }); return fetchImpl(request, options); },
    self: {
      registration: { scope },
      addEventListener: (name, listener) => listeners.set(name, listener),
      skipWaiting: async () => { skipWaitingCalls += 1; },
      clients: {
        claim: async () => {},
        matchAll: async () => clients.map((client) => ({ ...client, postMessage: (message) => messages.push({ id: client.id, ...message }) })),
      },
    },
  });
  vm.runInContext(runtime.replace('"__BUILD_VERSION__"', JSON.stringify(version)).replace('["__PRECACHE_FILES__"]', JSON.stringify(precache)), context);
  return {
    cacheMaps, messages, deleted, fetched,
    get skipWaitingCalls() { return skipWaitingCalls; },
    async dispatch(name, properties = {}) {
      const pending = [];
      let response;
      listeners.get(name)?.({
        ...properties,
        waitUntil: (promise) => pending.push(promise),
        respondWith: (promise) => { response = Promise.resolve(promise); },
      });
      await Promise.all(pending);
      return response ? await response : undefined;
    },
  };
}

test("installed shell navigation is immediate even when the network never replies", async () => {
  const worker = workerHarness({
    initialCaches: { [currentCache]: { [`${scope}index.html`]: new Response("cached shell") } },
    fetchImpl: () => new Promise(() => {}),
  });
  const response = await worker.dispatch("fetch", { request: { url: `${scope}?source=homescreen`, method: "GET", mode: "navigate" } });
  assert.equal(await response.text(), "cached shell");
  assert.equal(worker.fetched.length, 0);
});

test("installation precaches only exact local assets and waits for explicit activation", async () => {
  const worker = workerHarness({ clients: [{ id: "one", url: scope }] });
  await worker.dispatch("install");
  assert.deepEqual([...worker.cacheMaps.get(currentCache).keys()], precache.map((file) => `${scope}${file}`));
  assert.equal(worker.skipWaitingCalls, 0);
  assert.equal(worker.messages[0].type, "UPDATE_AVAILABLE");
  await worker.dispatch("message", { data: { type: "SKIP_WAITING" } });
  assert.equal(worker.skipWaitingCalls, 1);
});

test("Supabase, foreign scopes, POST requests and receipts bypass the service worker cache", async () => {
  const worker = workerHarness();
  for (const request of [
    { url: "https://project.supabase.co/rest/v1/rpc/bootstrap_brazil_trip", method: "GET" },
    { url: "https://example.test/another-app/index.html", method: "GET", mode: "navigate" },
    { url: `${scope}index.html`, method: "POST", mode: "navigate" },
    { url: `${scope}receipts/test.jpg`, method: "GET" },
  ]) assert.equal(await worker.dispatch("fetch", { request }), undefined);
  assert.equal(worker.cacheMaps.size, 0);
  assert.equal(worker.fetched.length, 0);
});

test("cache cleanup preserves active older tabs and never touches another application", async () => {
  const previousVersion = "0011223344556677";
  const previousCache = `tricount-brazil-shell-${previousVersion}`;
  const worker = workerHarness({
    clients: [{ id: "new", url: scope }, { id: "old", url: `${scope}#tasks` }],
    initialCaches: { [currentCache]: {}, [previousCache]: {}, "tricount-brazil-v34": {}, "unrelated-cache": {} },
  });
  await worker.dispatch("activate");
  assert.equal(worker.deleted.length, 0, "unknown open clients must protect older caches");
  await worker.dispatch("message", { source: { id: "new" }, data: { type: "CLIENT_VERSION", version } });
  assert.equal(worker.deleted.length, 0);
  await worker.dispatch("message", { source: { id: "old" }, data: { type: "CLIENT_VERSION", version: previousVersion } });
  assert.deepEqual(worker.deleted, ["tricount-brazil-v34"]);
  assert.ok(worker.cacheMaps.has(previousCache));
  assert.ok(worker.cacheMaps.has("unrelated-cache"));
});

test("an old tab can still load its old hashed asset from a retained cache", async () => {
  const worker = workerHarness({
    initialCaches: { "tricount-brazil-shell-0011223344556677": { [`${scope}assets/old-aabb.js`]: new Response("older module") } },
  });
  const response = await worker.dispatch("fetch", { request: { url: `${scope}assets/old-aabb.js`, method: "GET" } });
  assert.equal(await response.text(), "older module");
  assert.equal(worker.fetched.length, 0);
});

test("a missing shell falls back to a bounded network request and an offline recovery screen", async () => {
  const worker = workerHarness({
    timerDelay: 10,
    fetchImpl: (_request, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
  });
  const response = await worker.dispatch("fetch", { request: { url: scope, method: "GET", mode: "navigate" } });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Réessayer/);
  assert.equal(worker.fetched[0].options.signal.aborted, true);
});
