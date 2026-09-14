import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const iconRoot = resolve(root, "node_modules/@phosphor-icons/core/assets/regular");
const available = new Set((await readdir(iconRoot)).filter((name) => name.endsWith(".svg")).map((name) => name.slice(0, -4)));
const files = (await readdir(resolve(root, "src"), { recursive: true }))
  .filter((name) => /\.(?:js|html)$/.test(name));
const source = (await Promise.all(files.map((file) => readFile(resolve(root, "src", file), "utf8")))).join("\n");
const explicit = [...source.matchAll(/\bph-([a-z][a-z0-9-]*)/g)].map((match) => match[1]);
// Dynamic category/menu icons are string literals, e.g. ["basket", "courses"].
const dynamic = [...source.matchAll(/["'`]([a-z][a-z0-9-]*)["'`]/g)]
  .map((match) => match[1]).filter((name) => available.has(name));
const icons = [...new Set([...explicit, ...dynamic])].sort();
const missing = icons.filter((name) => !available.has(name));
if (missing.length) throw new Error(`Unknown Phosphor icons: ${missing.join(", ")}`);

const rules = [
  "/* Generated from @phosphor-icons/core (MIT). Run npm run icons. */",
  ".ph{display:inline-block;width:1em;height:1em;flex-shrink:0;vertical-align:-.125em;background-color:currentColor;-webkit-mask:var(--icon) center/contain no-repeat;mask:var(--icon) center/contain no-repeat;font-style:normal;line-height:1}",
];
for (const name of icons) {
  const svg = (await readFile(resolve(iconRoot, `${name}.svg`), "utf8"))
    .replace(/<\?xml[^>]*\?>/g, "").replace(/<!--[^]*?-->/g, "").trim();
  const uri = encodeURIComponent(svg).replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
  rules.push(`.ph-${name}{--icon:url("data:image/svg+xml,${uri}")}`);
}
await writeFile(resolve(root, "src/icons.css"), `${rules.join("\n")}\n`);
await copyFile(resolve(root, "node_modules/@phosphor-icons/core/LICENSE"), resolve(root, "public-static/phosphor-license.txt"));
console.log(`Generated ${icons.length} local icons (${Buffer.byteLength(rules.join("\n"))} bytes, no icon font/CDN).`);
