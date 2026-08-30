export default [
  {
    ignores: ["node_modules/**", "refs/**"],
  },
  {
    files: ["docs/**/*.js", "tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
];
