export default [
  {
    ignores: ["node_modules/**", "refs/**", "docs/**", "scripts/compose_cover.py"],
  },
  {
    files: ["src/**/*.js", "scripts/**/*.js", "scripts/**/*.mjs", "tests/**/*.mjs", "vite.config.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
];
