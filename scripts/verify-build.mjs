import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "docs");
const html = await readFile(resolve(output, "index.html"), "utf8");
const worker = await readFile(resolve(output, "sw.js"), "utf8");
const version = html.match(/name="app-build" content="([a-f0-9]{16})"/)?.[1];
assert.ok(version, "The built HTML must identify its cache version");
assert.ok(worker.includes(`const BUILD_VERSION = "${version}"`), "HTML and worker fingerprint must agree");
const precache = JSON.parse(worker.match(/const PRECACHE_FILES = (\[[^;]+\]);/)?.[1] || "null");
assert.ok(Array.isArray(precache) && precache.includes("index.html"), "Worker must precache the shell");
for (const file of precache) {
  assert.ok(!file.includes("..") && !file.startsWith("http"), `Unsafe precache path: ${file}`);
  assert.ok((await stat(resolve(output, file))).isFile(), `Missing precache resource: ${file}`);
}
assert.doesNotMatch(html, /(?:src|href)="https:\/\/(?:cdn\.jsdelivr\.net|fonts\.)/, "Critical dependencies must be self-hosted");
assert.doesNotMatch(html, /brazil-mineral|app\.js\?v=|styles\.css\?v=/, "Legacy unversioned critical assets must not ship");
assert.match(html, /src="\/tricount-brazil\/assets\/[^\"]+\.js"/);
assert.match(html, /href="\/tricount-brazil\/assets\/[^\"]+\.css"/);
let totalBytes = 0;
let transferBytes = 0;
const resourceRows = [];
const critical = ["index.html", ...[...html.matchAll(/(?:src|href)="\/tricount-brazil\/([^\"]+\.(?:js|css))"/g)].map((match) => match[1]), "icon-192.png"];
for (const file of [...new Set(critical)]) {
  const contents = await readFile(resolve(output, file));
  const transfer = /\.(html|js|css)$/.test(file) ? gzipSync(contents).length : contents.length;
  totalBytes += contents.length;
  transferBytes += transfer;
  resourceRows.push({ file, bytes: contents.length, gzipBytes: transfer });
}
assert.ok(transferBytes < 300 * 1024, `Critical transfer ${transferBytes} bytes exceeds 300 KiB budget`);
const cssAssets = (await readdir(resolve(output, "assets"))).filter((file) => file.endsWith(".css"));
for (const file of cssAssets) {
  const css = await readFile(resolve(output, "assets", file), "utf8");
  assert.doesNotMatch(css, /@font-face/, "No blocking icon/web font should ship");
  assert.doesNotMatch(css, /brazil-mineral/, "No legacy texture should load from CSS");
}
console.log(JSON.stringify({ version, precacheCount: precache.length, criticalBytes: totalBytes, criticalGzipBytes: transferBytes, resources: resourceRows }, null, 2));
