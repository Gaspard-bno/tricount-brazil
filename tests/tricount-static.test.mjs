import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFile(path.join(root, file), "utf8");

/** The Vite build fingerprints the client into docs/assets/index-*.js. */
async function bundle() {
  const dir = path.join(root, "docs/assets");
  const files = (await readdir(dir)).filter((file) => /^index-.*\.js$/.test(file));
  assert.ok(files.length >= 1, "le build Vite doit émettre docs/assets/index-*.js");
  const parts = await Promise.all(files.map((file) => readFile(path.join(dir, file), "utf8")));
  return parts.join("\n");
}

test("the shipped interface keeps the validated scope and exact names", async () => {
  const [html, app] = await Promise.all([read("docs/index.html"), bundle()]);
  const source = `${html}\n${app}`;
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

  // Every precached shell file must actually exist in the build output.
  const precache = JSON.parse(`[${worker.match(/const PRECACHE_FILES = \[([^\]]*)\]/)[1]}]`);
  assert.ok(precache.length >= 3, "le service worker doit précacher le shell");
  for (const asset of precache) await access(path.join(root, "docs", asset));
  for (const asset of ["docs/icon-192.png", "docs/icon-512.png", "docs/tricount-brazil-og.jpg"]) {
    assert.ok((await stat(path.join(root, asset))).size > 1_000, `${asset} doit être un asset réel`);
  }
});

test("browser persistence is Brazil-only", async () => {
  const app = await bundle();
  assert.match(app, /tricount-brazil-/);
  assert.match(app, /save_brazil_trip_state_secure/);
  assert.doesNotMatch(app, /save_marseille_trip_state|marseille-2026|marseille26-/);
});

test("the whole interface is protected by a server-verified remembered code", async () => {
  const [html, app, sql] = await Promise.all([
    read("docs/index.html"),
    bundle(),
    read("supabase-brazil-private-bootstrap.sql"),
  ]);
  assert.match(html, /id="access-gate"/);
  assert.match(html, /id="app-shell" hidden/);
  assert.match(app, /rpc\/bootstrap_brazil_trip/);
  assert.match(app, /server-v1/);
  assert.match(sql, /create or replace function public\.bootstrap_brazil_trip/);
  assert.match(sql, /security definer/);
  assert.match(sql, /extensions\.crypt/);
  assert.match(sql, /RATE_LIMITED/);
  assert.doesNotMatch(`${html}\n${app}\n${sql}`, /\b2006\b/);
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
