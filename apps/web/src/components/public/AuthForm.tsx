'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import type { AuthResult } from '@/app/auth/actions';

type Action = (formData: FormData) => Promise<AuthResult>;

/**
 * Client wrapper that submits the auth form to a server action.
 *
 * The action runs on the server, talks to Supabase, and on success redirects
 * to /dashboard (the redirect surfaces here as a thrown control-flow signal,
 * which we deliberately let propagate). On failure it returns a translation
 * key that we render in the active locale.
 *
 * `t` is passed in from the server component so there is still no hardcoded
 * string here.
 */
export function AuthForm({
  action, t, children,
}: {
  action: Action;
  t: (key: string) => string;
  children: ReactNode;
}) {
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErrorKey(null);
    startTransition(async () => {
      const result = await action(formData);
      // A returned object means failure; success redirects and never returns.
      if (result?.errorKey) setErrorKey(result.errorKey);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-4 border-0 p-0 disabled:opacity-70">
        {children}
      </fieldset>
      {errorKey && (
        <p role="alert" aria-live="polite"
          className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
          {t(errorKey)}
        </p>
      )}
    </form>
  );
}
