import type { Locale } from '@/i18n/config';

export function money(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'sk' ? 'sk-SK' : 'en-GB', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(value);
}

export function km(value: number, locale: Locale): string {
  return `${new Intl.NumberFormat(locale === 'sk' ? 'sk-SK' : 'en-GB', {
    maximumFractionDigits: 1,
  }).format(value)} km`;
}

/** Signed race gap, e.g. "+1:18" or "-0:24". */
export function gap(seconds: number): string {
  const s = Math.round(Math.abs(seconds));
  const sign = seconds < 0 ? '-' : '+';
  return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Absolute elapsed time, e.g. "18h 24' 32\"". */
export function elapsed(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}' ${String(s % 60).padStart(2, '0')}"`;
}
