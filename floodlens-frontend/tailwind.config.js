/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef9ff',
          100: '#d8f1ff',
          200: '#b9e8ff',
          300: '#89daff',
          400: '#51c3fe',
          500: '#29a4fb',
          600: '#1285f0',
          700: '#0b6add',
          800: '#1056b3',
          900: '#134b8d',
          950: '#0f2f57',
        },
        flood: {
          low:    '#22c55e',
          medium: '#f59e0b',
          high:   '#ef4444',
          severe: '#7c3aed',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer':    'shimmer 2s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
      },
    },
  },
  plugins: [],
}
