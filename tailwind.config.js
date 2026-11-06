/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0a0a',
          900: '#111111',
          850: '#141414',
          800: '#181818',
          700: '#1f1f1f',
          600: '#262626',
          500: '#333333',
          400: '#3a3a3a',
        },
        accent: '#facc15',
        brand: {
          yellow: '#facc15',
          green: '#22c55e',
          red: '#ef4444',
          blue: '#3b82f6',
        }
      },
      fontFamily: {
        serif: ["'Source Serif 4'", 'DejaVu Serif', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'DejaVu Sans Mono', 'monospace'],
      }
    },
  },
  plugins: [],
};
