import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Manrope } from 'next/font/google';
import { getLocale } from '@/i18n/server';
import './globals.css';

/**
 * Self-hosted via next/font (no external <link>, no layout shift). Exposed
 * as a CSS variable and wired up as the default `font-sans` stack in
 * tailwind.config.ts, so every existing `font-sans`/unstyled-text element
 * picks it up automatically — Inter/system-ui remain as fallbacks there.
 */
const manrope = Manrope({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Cycling Manager',
  description: 'Cycling management game dashboard',
  icons: { icon: '/icon.png' },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={manrope.variable}>
      <body className="min-h-screen bg-surface font-sans antialiased">{children}</body>
    </html>
  );
}
