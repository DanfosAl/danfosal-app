module.exports = {
  content: ['../www/**/*.html', '../www/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Manrope', 'sans-serif'] },
      colors: {
        background: '#050b07',
        surface: { dark: '#0a120c', light: '#121e16' },
        primary: '#4ade80',
        secondary: '#a855f7',
        accent: '#f43f5e'
      }
    }
  },
  plugins: [],
};
