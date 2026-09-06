'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { RegisterResult, UnregisterResult } from '@/lib/races/registration';
import { Icon } from '../ui/Icon';

type SelectionState = 'available' | 'selected' | 'overlap' | 'season-limit';

/**
 * Client wrapper around the register/unregister server actions.
 *
 * The actions themselves previously returned void, so a failure (RLS
 * rejection, already-registered race, overlap, season limit) was silently
 * swallowed — the button just sat there looking like it did nothing. This
 * component calls the actions directly (not via <form action>), tracks a
 * pending state to disable the button and block double-submits, and renders
 * whatever result comes back.
 *
 * Messages are plain resolved strings (not the `t` function): a function
 * cannot cross the server/client boundary, same rule as AuthForm.
 */
export function TourRegistrationButton({
  tourId, initialState, labels, registerAction, unregisterAction,
}: {
  tourId: string;
  initialState: SelectionState;
  labels: {
    register: string;
    registering: string;
    registered: string;
    cancel: string;
    cancelling: string;
    overlap: string;
    seasonLimit: string;
    genericError: string;
  };
  registerAction: (tourId: string) => Promise<RegisterResult>;
  unregisterAction: (tourId: string) => Promise<UnregisterResult>;
}) {
  const router = useRouter();
  const [state, setState] = useState<SelectionState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function messageFor(reason: string): string {
    if (reason === 'date-overlap') return labels.overlap;
    if (reason === 'season-limit') return labels.seasonLimit;
    return labels.genericError;
  }

  function handleRegister() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await registerAction(tourId);
      if (result.ok) {
        setState('selected');
        // The action already revalidated /races, /races/[id] and /dashboard;
        // refresh so the start list and season counters on THIS render pick
        // that up too (a server action called imperatively, not via a plain
        // <form action>, does not auto-refresh the route on its own).
        router.refresh();
      } else if (result.reason === 'already-registered') {
        // The Rider already has this Tour (e.g. a duplicate click raced the
        // first request) — that is the state the player wanted, not an error.
        setState('selected');
        router.refresh();
      } else {
        setError(messageFor(result.reason));
      }
    });
  }

  function handleUnregister() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await unregisterAction(tourId);
      if (result.ok) {
        setState('available');
        router.refresh();
      } else if (result.reason === 'not-registered') {
        setState('available');
        router.refresh();
      } else {
        setError(messageFor(result.reason));
      }
    });
  }

  if (state === 'overlap' || state === 'season-limit') {
    return (
      <button type="button" disabled
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-rail px-3 py-2 text-sm font-semibold text-navy-muted/70">
        {state === 'overlap' ? labels.overlap : labels.seasonLimit}
      </button>
    );
  }

  if (state === 'selected') {
    return (
      <div className="space-y-2">
        <div
          aria-live="polite"
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-rail px-3 py-2 text-sm font-semibold text-teal-dark"
        >
          {labels.registered}
        </div>
        <button
          type="button"
          onClick={handleUnregister}
          disabled={pending}
          aria-busy={pending}
          className="w-full text-center text-2xs font-medium text-navy-soft transition-colors hover:text-navy disabled:opacity-60"
        >
          {pending ? labels.cancelling : labels.cancel}
        </button>
        {error && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-2xs text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleRegister}
        disabled={pending}
        aria-busy={pending}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-70"
      >
        {!pending && <Icon name="flag" className="h-4 w-4" />}
        {pending ? labels.registering : labels.register}
      </button>
      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-2xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
