import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getLocale } from '@/i18n/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cycling Manager',
  description: 'Cycling management game dashboard',
  icons: { icon: '/icon.png' },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-surface antialiased">{children}</body>
    </html>
  );
}
