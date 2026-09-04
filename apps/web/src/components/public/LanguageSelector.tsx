'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  LOCALES, LOCALE_NAMES, LOCALE_SHORT, LOCALE_COOKIE, type Locale,
} from '@/i18n/config';

type Variant = 'segmented' | 'compact';

/**
 * Locale switcher.
 *
 * Writes the locale cookie and refreshes the route so every server-rendered
 * string re-resolves. One mechanism, two presentations: a segmented bar for the
 * public header where there is room to show all seven, and an icon-sized
 * control for the in-game top bar where there is not.
 */
export function LanguageSelector({
  locale, label, variant = 'segmented',
}: {
  locale: Locale;
  label: string;
  variant?: Variant;
}) {
  const router = useRouter();
  const [value, setValue] = useState<Locale>(locale);
  const [pending, startTransition] = useTransition();

  function change(next: Locale) {
    if (next === value) return;
    setValue(next);
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
    document.documentElement.lang = next;
    startTransition(() => router.refresh());
  }

  if (variant === 'compact') return <CompactSelector value={value} label={label} pending={pending} onChange={change} />;

  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex items-center rounded-xl border border-line bg-card/90 p-1 shadow-sm backdrop-blur ${pending ? 'opacity-70' : ''}`}
    >
      {LOCALES.map((l) => {
        const active = l === value;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-current={active ? 'true' : undefined}
            title={LOCALE_NAMES[l]}
            disabled={pending}
            onClick={() => change(l)}
            className={`rounded-lg px-2 py-1.5 text-xs font-semibold tracking-wide transition-colors sm:px-3 sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal ${
              active
                ? 'bg-teal text-white shadow-sm'
                : 'text-navy-soft hover:bg-teal-rail hover:text-navy'
            }`}
          >
            <span className="sr-only">{LOCALE_NAMES[l]}</span>
            <span aria-hidden="true">{LOCALE_SHORT[l]}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Icon-sized variant. A native select sits invisibly over the badge so this
 * stays a real, keyboard-operable control instead of a custom menu that would
 * need its own accessibility work.
 */
function CompactSelector({
  value, label, pending, onChange,
}: {
  value: Locale;
  label: string;
  pending: boolean;
  onChange: (l: Locale) => void;
}) {
  return (
    <span
      className="relative inline-flex items-center gap-1 rounded-lg px-2 py-2 text-navy-soft transition-colors hover:bg-teal-rail focus-within:outline focus-within:outline-2 focus-within:outline-teal"
      title={LOCALE_NAMES[value]}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4.5 w-4.5"
        fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
      </svg>
      <span className="text-2xs font-bold tracking-wide">{LOCALE_SHORT[value]}</span>
      <label htmlFor="locale-select-compact" className="sr-only">{label}</label>
      <select
        id="locale-select-compact"
        value={value}
        disabled={pending}
        onChange={(e) => onChange(e.target.value as Locale)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>{LOCALE_NAMES[l]}</option>
        ))}
      </select>
    </span>
  );
}
