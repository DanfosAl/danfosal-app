module.exports = {
  content: ['../www/**/*.html', '../www/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: "#6366F1",
        secondary: "#EC4899",
        success: "#10B981",
        warning: "#F59E0B",
        "background-light": "#F3F4F6",
        "background-dark": "#0F111A",
        "surface-dark": "#1E2030",
        "surface-hover": "#2D3045",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.75rem",
      },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};
