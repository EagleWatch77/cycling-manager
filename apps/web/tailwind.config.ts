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
        surface: '#f3f6f7',
        card: '#ffffff',
        line: '#e1e8eb',
        // Text: navy = main text + big headings, soft = secondary, muted = supporting info (still readable, >= 4.5:1 on white).
        navy: { DEFAULT: '#102a43', soft: '#3a566f', muted: '#5b7389' },
        // Teal = small-window titles, links, active elements. dark = teal text on light backgrounds (contrast).
        teal: { DEFAULT: '#0d9488', dark: '#0b7469', light: '#d6f0ec', rail: '#eaf7f4' },
        // League table + status surfaces (shared design system, not Rebríčky-only).
        mint: { head: '#ddf3ef', sub: '#eaf7f4', me: '#c9eee6', promo: '#e8f8e3', relegation: '#fdebec', stripe: '#f8fafb' },
        good: '#15803d',
        warn: '#d97706',
        danger: '#dc2626',
      },
      fontFamily: {
        sans: ['var(--font-manrope)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      // One typographic scale for the whole game (see DESIGN_SYSTEM.md "Typography"). Font: Manrope only.
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1rem' }], // supporting info 12px
        page: ['1.75rem', { lineHeight: '2.125rem', fontWeight: '700', letterSpacing: '-0.01em' }], // page title 28px bold
        section: ['1.1875rem', { lineHeight: '1.6rem', fontWeight: '600' }], // larger section title 19px semibold
        window: ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '600' }], // small window title 13px semibold (teal)
        table: ['0.8125rem', { lineHeight: '1.2rem' }], // table text 13px
        value: ['1.5rem', { lineHeight: '1.75rem', fontWeight: '700' }], // key values (OVR, points, bike level) 24px
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
