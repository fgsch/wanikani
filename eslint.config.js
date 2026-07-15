import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/"],
  },

  js.configs.recommended,

  eslintConfigPrettier,

  {
    files: ["**/*.js"],

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.greasemonkey,
      },
    },

    rules: {
      curly: ["error", "all"],
      eqeqeq: ["error", "always"],
      "no-duplicate-imports": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-const": "error",

      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
];
