import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("the shipped interface keeps the validated scope and exact names", async () => {
  const [html, app, core] = await Promise.all([
    read("docs/index.html"),
    read("docs/app.js"),
    read("docs/core.js"),
  ]);
  const source = `${html}\n${app}\n${core}`;
  assert.match(html, /<strong>Dépense<\/strong>/);
  assert.match(html, /<strong>À acheter<\/strong>/);
  assert.match(html, /<strong>Tâche<\/strong>/);
  assert.doesNotMatch(source, /Raphaël|Rafael|Gabriel|Moments|Maison/);
  assert.match(source, /Gaspard/);
  assert.match(source, /Raphael/);
  assert.match(html, /Navigation principale mobile/);
  assert.match(html, /data-view="accounts"/);
  assert.match(html, /data-view="lists"/);
  assert.match(html, /data-view="tasks"/);
});

test("privacy, social preview and PWA metadata are complete", async () => {
  const [html, manifest, worker] = await Promise.all([
    read("docs/index.html"),
    read("docs/manifest.webmanifest"),
    read("docs/sw.js"),
  ]);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(html, /rel="canonical" href="https:\/\/gaspard-bno\.github\.io\/tricount-brazil\/"/);
  assert.match(html, /property="og:image" content="https:\/\//);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.name, "Tricount Brazil");
  assert.deepEqual(parsedManifest.icons.map(({ sizes }) => sizes), ["192x192", "512x512"]);

  const shellAssets = [...worker.matchAll(/"\.\/([^"?]+)(?:\?[^" ]+)?"/g)]
    .map((match) => match[1])
    .filter((asset) => asset !== "");
  for (const asset of shellAssets) await access(path.join(root, "docs", asset));
  for (const asset of ["docs/icon-192.png", "docs/icon-512.png", "docs/tricount-brazil-og.png"]) {
    assert.ok((await stat(path.join(root, asset))).size > 1_000, `${asset} doit être un asset réel`);
  }
});

test("browser persistence is Brazil-only", async () => {
  const app = await read("docs/app.js");
  const values = [...app.matchAll(/const (?:CACHE|BASE|VERSION|PENDING|GROUP_CODE|RATE_CACHE)_KEY = "([^"]+)"/g)]
    .map((match) => match[1]);
  assert.equal(values.length, 6);
  assert.ok(values.every((value) => value.startsWith("tricount-brazil-")));
  assert.match(app, /save_brazil_trip_state/);
  assert.doesNotMatch(app, /save_marseille_trip_state|marseille26-/);
});

test("the Supabase migration is additive and isolates Marseille", async () => {
  const sql = await read("supabase-brazil-migration.sql");
  const statements = sql.split(";").map((statement) => statement.trim()).filter(Boolean);
  assert.ok(statements.some((statement) => /insert into public\.trip_state/i.test(statement) && /tricount-brazil-2026/.test(statement)));
  assert.ok(statements.some((statement) => /from public\.trip_state/i.test(statement) && /access_code_hash/i.test(statement) && /marseille-2026/.test(statement)));
  assert.ok(!statements.some((statement) => /update\s+public\.trip_state/i.test(statement) && /marseille-2026/.test(statement)));
  assert.ok(!statements.some((statement) => /delete\s+from\s+public\.trip_state/i.test(statement) && /marseille-2026/.test(statement)));
  assert.match(sql, /p_state ->> 'tripId' <> 'tricount-brazil-2026'/);
  assert.match(sql, /on conflict \(id\) do nothing/);
});

test("legacy entry points redirect to the new root", async () => {
  for (const file of ["docs/comptes.html", "docs/budget.html"]) {
    const html = await read(file);
    assert.match(html, /rel="canonical" href="\.\/"/);
    assert.match(html, /location\.replace\("\.\/" \+ location\.hash\)/);
  }
});
