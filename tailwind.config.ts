import type { Config } from 'tailwindcss';

export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff',
          100: '#d9ecff',
          200: '#b9dcff',
          300: '#8fc7ff',
          400: '#61acff',
          500: '#3a8fff',
          600: '#1e73ea',
          700: '#175cc0',
          800: '#144c99',
          900: '#143f7a'
        }
      },
      boxShadow: {
        card: '0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04)'
      }
    },
  },
  plugins: [],
} satisfies Config;
