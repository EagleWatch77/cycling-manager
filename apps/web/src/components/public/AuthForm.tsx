'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import type { AuthResult } from '@/app/auth/actions';

type Action = (formData: FormData) => Promise<AuthResult>;
type Notice = { key: string; tone: 'error' | 'info' };

/**
 * Client wrapper that submits the auth form to a server action.
 *
 * The action runs on the server, talks to Supabase, and on a clean success
 * redirects to /dashboard (that redirect surfaces here as a thrown control-flow
 * signal we let propagate). Otherwise it returns a message key plus a tone:
 * red for a real error, neutral for the "check your inbox" notice after
 * sign-up with email confirmation on.
 *
 * Messages are a plain key->text map, NOT the `t` function: a function cannot
 * cross the server/client boundary next to a server action.
 */
export function AuthForm({
  action, messages, children,
}: {
  action: Action;
  messages: Record<string, string>;
  children: ReactNode;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setNotice(null);
    startTransition(async () => {
      const result = await action(formData);
      // A returned object means we stayed on the page; success redirects away.
      if (result?.messageKey) setNotice({ key: result.messageKey, tone: result.tone });
    });
  }

  const text = notice ? (messages[notice.key] ?? messages['auth.errorGeneric']) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-4 border-0 p-0 disabled:opacity-70">
        {children}
      </fieldset>
      {text && (
        <p role={notice!.tone === 'error' ? 'alert' : 'status'} aria-live="polite"
          className={`rounded-lg border px-3 py-2 text-xs ${
            notice!.tone === 'error'
              ? 'border-danger/30 bg-danger/5 text-danger'
              : 'border-teal/30 bg-teal-rail text-teal-dark'
          }`}>
          {text}
        </p>
      )}
    </form>
  );
}
