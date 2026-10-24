/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: '#166534',
          hover:   '#14532D',
          light:   '#E5F2E8',
        },
        emerald: {
          accent:  '#22A06B',
        },
        charcoal:  '#26332C',
        'muted-green': '#647067',
        'border-subtle': '#DCE5DD',
        'sage-subtle': '#F1F5F1',
        brand: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22A06B',
          600: '#166534',
          700: '#15803d',
          800: '#166534',
          900: '#14532D',
          950: '#052e16',
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
