import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const root = resolve(import.meta.dirname, "..");
const url = process.argv[2] || "http://127.0.0.1:4173/tricount-brazil/";
const parsed = new URL(url);
if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Provide an HTTP(S) URL to audit.");
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
} catch (error) {
  throw new Error(`Audit target unavailable. Start npm run preview -- --port 4173 or pass a URL. ${error.message}`);
}

// Explicit CLI command; never imported by the application or run during a build.
// Audits the initial shell/gate. Authenticated/offline flows need separate browser QA.
const output = resolve(root, "outputs/lighthouse");
await mkdir(output, { recursive: true });
const execute = promisify(execFile);
const reports = [];
for (let run = 1; run <= 3; run += 1) {
  const file = resolve(output, `mobile-${run}.json`);
  await execute(process.execPath, [
    resolve(root, "node_modules/lighthouse/cli/index.js"), url,
    "--output=json", `--output-path=${file}`,
    "--only-categories=performance,accessibility,best-practices",
    "--chrome-flags=--headless", "--quiet",
  ], { cwd: root, timeout: 120_000, maxBuffer: 1024 * 1024 });
  reports.push(JSON.parse(await readFile(file, "utf8")));
}
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const category = (name) => median(reports.map((report) => report.categories[name].score * 100));
const metric = (name) => median(reports.map((report) => report.audits[name].numericValue));
const result = {
  url, date: new Date().toISOString(), runs: reports.length,
  note: "Median mobile Lighthouse results for the initial shell; not authenticated flow measurements.",
  performance: category("performance"), accessibility: category("accessibility"), bestPractices: category("best-practices"),
  lcpMs: metric("largest-contentful-paint"), cls: metric("cumulative-layout-shift"),
  totalBlockingTimeMs: metric("total-blocking-time"), transferBytes: metric("total-byte-weight"),
};
const failures = [];
if (result.performance < 90) failures.push("Performance below 90/100");
if (result.accessibility < 95) failures.push("Accessibility below 95/100");
if (result.lcpMs > 2500) failures.push("LCP above 2.5 seconds");
if (result.cls > 0.05) failures.push("CLS above 0.05");
if (result.transferBytes > 300 * 1024) failures.push("Transfer above 300 KiB");
await writeFile(resolve(output, "summary.json"), `${JSON.stringify({ ...result, failures }, null, 2)}\n`);
console.log(JSON.stringify({ ...result, failures }, null, 2));
if (failures.length) process.exitCode = 1;
