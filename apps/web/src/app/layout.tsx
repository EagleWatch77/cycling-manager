import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DEFAULT_LOCALE } from '@/i18n/config';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cycling Manager',
  description: 'Cycling management game dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body className="min-h-screen bg-surface antialiased">{children}</body>
    </html>
  );
}
