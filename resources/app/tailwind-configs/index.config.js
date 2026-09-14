module.exports = {
  content: ['../www/**/*.html', '../www/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        "bg-main": "#0f172a",
        "bg-secondary": "#1e293b",
        "card-dark": "#1e293b",
        "accent-primary": "#6366f1",
        "accent-secondary": "#ec4899",
        "accent-success": "#10b981",
        "accent-warning": "#f59e0b",
        "accent-info": "#06b6d4",
        "text-primary": "#f8fafc",
        "text-secondary": "#94a3b8",
        "text-tertiary": "#64748b",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
      },
      boxShadow: {
        'neon': '0 0 20px -5px rgba(99, 102, 241, 0.4)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.15)',
      }
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/container-queries')],
};
