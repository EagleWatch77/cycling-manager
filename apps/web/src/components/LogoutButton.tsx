import { signOut } from '@/app/auth/actions';

/** Sign-out control for the in-game profile menu. A tiny form posts to the action. */
export function LogoutButton({ label }: { label: string }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="transition-colors hover:bg-teal-rail focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-navy-soft" fill="none" stroke="currentColor"
          strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        {label}
      </button>
    </form>
  );
}
