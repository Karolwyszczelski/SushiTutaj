module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,vue,html}',   // React/Vue/HTML w src
    './public/**/*.html',                     // główny index.html i inne
    './src/components/**/*.{js,ts,jsx,tsx}',  // komponenty
    './src/**/*.{php,twig,blade.php}',        // jeśli masz jakieś PHP/Twig
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-montserrat)", "sans-serif"],
        marker: ["var(--font-marker)", "cursive"],
        "permanent-marker": ['var(--font-permanent)', 'cursive'],
        covered: ['var(--font-covered)', 'cursive'],
        smooch: ["var(--font-smooch)", "cursive"],
        impact: ['var(--font-impact)', 'Impact', 'sans-serif'],
        meddon: ['var(--font-meddon)', 'sans-serif'],
        pinyon: ['PinyonScript', 'cursive'],
        mrBedfort: ['MrBedfort', 'cursive'],

      },
      colors: {
         primary: '#FFD700',   // albo dowolny inny hex żółtego
          light:   '#FFEA7F',   // opcjonalnie jaśniejszy odcień
          dark:    '#CCAC00',   // i ciemniejszy
      },
    },
  },
  plugins: [],
};
