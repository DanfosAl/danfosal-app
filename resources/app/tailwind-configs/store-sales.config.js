module.exports = {
  content: ['../www/**/*.html', '../www/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        "primary": "#2bee79",
        "background-light": "#f6f8f7",
        "background-dark": "#102217",
        "surface-dark": "#112218",
        "surface-darker": "#0b1810",
      },
      fontFamily: {
        "display": ["Spline Sans", "sans-serif"],
        "body": ["Noto Sans", "sans-serif"],
      },
      borderRadius: { "DEFAULT": "0.25rem", "lg": "0.5rem", "xl": "0.75rem", "2xl": "1rem", "full": "9999px" },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')],
};
