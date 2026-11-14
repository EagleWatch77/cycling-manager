'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './ui/Icon';

/**
 * Manager profile button + small dropdown. Holds the manager's name and
 * league (moved here from the top bar) and the existing account actions
 * passed in as children (sign-out). Closes on outside click and Escape.
 */
export function ProfileMenu({
  label, name, leagueLine, children,
}: {
  label: string;
  name: string | null;
  leagueLine: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-white transition-colors hover:bg-navy-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
      >
        <Icon name="rider" className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-card border border-line bg-card shadow-card"
        >
          <div className="border-b border-line px-3.5 py-2.5">
            {name && <p className="truncate text-sm font-bold text-navy">{name}</p>}
            <p className="text-2xs text-navy-muted">{leagueLine}</p>
          </div>
          <div className="[&_button]:flex [&_button]:w-full [&_button]:items-center [&_button]:gap-2 [&_button]:rounded-none [&_button]:px-3.5 [&_button]:py-2 [&_button]:text-xs [&_button]:font-medium [&_button]:text-navy">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
