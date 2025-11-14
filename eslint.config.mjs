// eslint.config.mjs
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// 1) Bierzemy domyślny zestaw Nexta (core-web-vitals + TS)
const baseConfig = compat.extends("next/core-web-vitals", "next/typescript");

// 2) Doklejamy nasze globalne reguły (to, co miałeś w .eslintrc.cjs)
const projectOverrides = {
  rules: {
    // TS – nie blokuj nas na any, unused itp.
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-empty-object-type": "off",
    "@typescript-eslint/no-require-imports": "off",

    // Next – pozwól używać <a> i <img>, jeśli chcesz
    "@next/next/no-html-link-for-pages": "off",
    "@next/next/no-img-element": "off",
  },
};

const eslintConfig = [
  ...baseConfig,
  projectOverrides, // nasze reguły nadpisują domyślne
];

export default eslintConfig;
