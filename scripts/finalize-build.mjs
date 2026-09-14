import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "docs");
const html = await readFile(resolve(output, "index.html"), "utf8");
const runtime = await readFile(resolve(root, "scripts/service-worker-runtime.js"), "utf8");
const assets = (await readdir(resolve(output, "assets"))).filter((name) => /\.(js|css|svg|webp|avif)$/.test(name)).sort();
const precache = ["index.html", ...assets.map((name) => `assets/${name}`), "manifest.webmanifest", "icon-192.png"];
const fingerprint = createHash("sha256").update(runtime);
for (const file of precache) fingerprint.update(file).update(await readFile(resolve(output, file)));
const version = fingerprint.digest("hex").slice(0, 16);
const worker = runtime.replace('"__BUILD_VERSION__"', JSON.stringify(version))
  .replace('["__PRECACHE_FILES__"]', JSON.stringify(precache));
await writeFile(resolve(output, "index.html"), html.replace("</head>", `    <meta name="app-build" content="${version}" />\n  </head>`));
await writeFile(resolve(output, "sw.js"), worker);
await writeFile(resolve(output, ".nojekyll"), "");
console.log(`Generated service worker ${version}: ${precache.length} exact precache resources.`);
