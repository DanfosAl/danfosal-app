module.exports = {
  content: ['../www/**/*.html', '../www/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        "primary": "#8b5cf6",
        "primary-hover": "#7c3aed",
        "secondary": "#a78bfa",
        "accent": "#f43f5e",
        "background-light": "#f8fafc",
        "background-dark": "#0f172a",
        "surface-dark": "#1e293b",
        "surface-darker": "#020617",
        "text-secondary": "#94a3b8",
        "border-color": "#334155",
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
