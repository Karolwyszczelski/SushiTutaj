// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  // bazowa konfiguracja Next + TS
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // projektowe nadpisania reguł – tak jak miałeś w .eslintrc.cjs
  {
    rules: {
      // TS – nie blokuj builda na "any", niewykorzystanych zmiennych itd.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-require-imports": "off",

      // Next – pozwól używać <a> do routingu po stronach
      "@next/next/no-html-link-for-pages": "off",
      // jeśli chcesz, możesz też wyłączyć no-img-element:
      // "@next/next/no-img-element": "off",
    },
  },
];
