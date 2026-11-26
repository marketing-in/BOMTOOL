import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-e2e/**",
      ".next-prod/**",
      ".next-prod-b/**",
      ".next-check/**",
      ".next-ui/**",
      ".impeccable/**",
      ".claude/**",
      "src/vendor/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      ".pgdata/**",
      "test-results/**",
      "playwright-report/**",
      "samples/**",
    ],
  },
];

export default eslintConfig;
