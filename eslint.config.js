import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default [
  // Global ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/routeTree.gen.ts",
      ".worktrees/**",
      "**/*.sql",
      "packages/**/drizzle/**",
      "packages/**/migrations/**",
      "packages/dashboard/src/api/generated/**",
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript recommended (non type-checked; fast and avoids project-wide tsconfig churn)
  ...tseslint.configs.recommended,

  // Common TS/JS rules for all packages
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // Allow leading-underscore to opt out of unused checks
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // Warn (not error) — the OSS release review targets these
      "@typescript-eslint/no-explicit-any": "warn",
      // Practical defaults
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-case-declarations": "off",
      "no-inner-declarations": "off",
      "prefer-const": "warn",
      "no-useless-escape": "warn",
    },
  },

  // React rules — dashboard package only
  {
    files: ["packages/dashboard/**/*.{ts,tsx,js,jsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // React 19 / new JSX transform — no need to import React
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      // Pragmatic: ReactNode children typing covers these
      "react/prop-types": "off",
      "react/display-name": "off",
      // Warn, not error — lots of legacy call-sites
      "react/no-unescaped-entities": "warn",
      "react-hooks/exhaustive-deps": "warn",
      // react-hooks 7+ added several stricter rules that flag many pre-existing
      // patterns. Downgrade to warn so they surface without breaking CI.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/unsupported-syntax": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/void-use-memo": "warn",
      "react-hooks/component-hook-factories": "warn",
      "react-hooks/config": "warn",
      "react-hooks/gating": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/rules-of-hooks": "error",
    },
  },

  // Node / backend packages — prefer node globals
  {
    files: [
      "packages/daemon/**/*.{ts,js}",
      "packages/cli/**/*.{ts,js}",
      "packages/shared/**/*.{ts,js}",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Test files — loosen a few rules
  {
    files: [
      "**/*.{test,spec}.{ts,tsx,js,jsx}",
      "**/__tests__/**/*.{ts,tsx,js,jsx}",
      "**/test-setup-mocks.ts",
      "**/test-utils.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  // Config files
  {
    files: [
      "**/*.config.{js,ts,mjs,cjs}",
      "**/vite.config.{js,ts}",
      "**/vitest.config.{js,ts}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Turn off rules that conflict with Prettier (must be last)
  prettier,
];
