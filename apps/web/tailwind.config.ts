import type { Config } from 'tailwindcss';

/**
 * Visual identity: near-white surface, teal accent, dark navy type.
 * Kept as named tokens so a polish pass changes values, not components.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#f5f7f8',
        card: '#ffffff',
        line: '#e4e9ec',
        navy: { DEFAULT: '#12283d', soft: '#33506a', muted: '#6b8195' },
        teal: { DEFAULT: '#0e9384', dark: '#0b7469', light: '#d6f0ec', rail: '#e8f4f2' },
        warn: '#d97706',
        danger: '#dc2626',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.9rem' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(18,40,61,.05), 0 1px 3px rgba(18,40,61,.04)',
      },
      borderRadius: { card: '0.75rem' },
    },
  },
  plugins: [],
};
export default config;
