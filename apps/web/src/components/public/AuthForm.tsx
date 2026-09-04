'use client';

import { useState, type FormEvent, type ReactNode } from 'react';

/**
 * Real <form> wrapper for the auth screens.
 *
 * Without this the submit button did nothing at all: `required` and Enter-to-
 * submit only work inside a form. Native validation now runs, plus a password
 * match check when both password fields are present.
 *
 * There is no backend yet, so submission is stopped and the reason is shown
 * instead of silently reloading the page.
 */
export function AuthForm({
  children, notConnectedText, mismatchText,
}: {
  children: ReactNode;
  notConnectedText: string;
  mismatchText: string;
}) {
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const pw = data.get('password');
    const confirm = data.get('confirmPassword');

    if (typeof confirm === 'string' && pw !== confirm) {
      setMessage({ text: mismatchText, tone: 'error' });
      return;
    }
    setMessage({ text: notConnectedText, tone: 'info' });
  }

  return (
    <form onSubmit={onSubmit} noValidate={false} className="space-y-3">
      {children}
      {message && (
        <p
          role="status"
          aria-live="polite"
          className={`rounded-lg border px-3 py-2 text-xs ${
            message.tone === 'error'
              ? 'border-danger/30 bg-danger/5 text-danger'
              : 'border-line bg-surface text-navy-soft'
          }`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
