module.exports = {
  content: ['../www/**/*.html', '../www/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: "#6366f1",
        "background-light": "#f3f4f6",
        "background-dark": "#0F111A",
        "card-dark": "#1E2030",
        "card-darker": "#151725",
        "surface-hover": "#2D3045",
        "accent-blue": "#3b82f6",
        "accent-purple": "#8b5cf6",
        "accent-green": "#10b981",
        "accent-orange": "#f59e0b",
      },
      fontFamily: {
        display: ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.75rem",
      },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};
