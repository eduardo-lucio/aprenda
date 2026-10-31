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
        dark: {
          900: '#0a0a0a',
          850: '#111111',
          800: '#171717',
          700: '#1e293b',
          600: '#334155',
        },
        brand: {
          yellow: '#facc15',
          green: '#22c55e',
          red: '#ef4444',
          blue: '#3b82f6',
        }
      },
      fontFamily: {
        serif: ['DejaVu Serif', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'DejaVu Sans Mono', 'monospace'],
      }
    },
  },
  plugins: [],
};
