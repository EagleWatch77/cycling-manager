import { signOut } from '@/app/auth/actions';

/** Sign-out control for the in-game top bar. A tiny form posts to the action. */
export function LogoutButton({ label }: { label: string }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        title={label}
        aria-label={label}
        className="rounded-lg p-2 text-navy-soft transition-colors hover:bg-teal-rail hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
      >
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
      </button>
    </form>
  );
}
