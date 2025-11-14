// .eslintrc.cjs
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ["next/core-web-vitals"],
  rules: {
    // TS – nie blokuj builda na "any" itp.
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-empty-object-type": "off",
    "@typescript-eslint/no-require-imports": "off",

    // Next – pozwól używać <a> i <img> jeśli chcesz
    "@next/next/no-html-link-for-pages": "off",
    "@next/next/no-img-element": "off",
  },
};
