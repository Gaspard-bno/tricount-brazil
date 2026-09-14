import { resolve } from "node:path";
import { defineConfig } from "vite";

// GitHub Pages publishes docs/. Runtime remains plain browser JavaScript.
export default defineConfig({
  root: resolve(import.meta.dirname, "src"),
  publicDir: resolve(import.meta.dirname, "public-static"),
  base: "/tricount-brazil/",
  build: {
    outDir: resolve(import.meta.dirname, "docs"),
    emptyOutDir: true,
    target: ["es2022", "safari16"],
    assetsInlineLimit: 0,
    sourcemap: false,
    manifest: true,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 200,
  },
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
});
