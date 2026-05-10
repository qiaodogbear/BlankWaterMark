import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17201b',
        moss: '#44624a',
        mint: '#dff5e7',
        copper: '#b66b45',
        paper: '#f7f3ea',
      },
      boxShadow: {
        soft: '0 18px 60px rgba(21, 32, 27, 0.12)',
      },
    },
  },
  plugins: [],
} satisfies Config;
