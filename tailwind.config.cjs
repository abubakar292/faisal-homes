const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [path.join(__dirname, 'client/index.html'), path.join(__dirname, 'client/src/**/*.{js,jsx}')],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
      colors: {
        navy: { 50: '#eef3fa', 100: '#d6e2f2', 200: '#adc4e4', 500: '#2d5a92', 600: '#1d4373', 700: '#143258', 800: '#0f2747', 900: '#0b2545', 950: '#071a33' },
        gold: { 50: '#fbf7ea', 100: '#f4ebc9', 300: '#e3cb7d', 400: '#d4af37', 500: '#b08d2f', 600: '#8f7125' },
      },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.06)' },
    },
  },
  plugins: [],
};
