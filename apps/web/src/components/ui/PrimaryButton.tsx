import type { ReactNode } from 'react';

type Variant = 'primary' | 'secondary';

const STYLES: Record<Variant, string> = {
  primary: 'bg-teal text-white hover:bg-teal-dark',
  secondary: 'border border-line bg-card text-navy hover:border-teal hover:text-teal',
};

/** Shared call to action. Renders an anchor when `href` is given, a button otherwise. */
export function PrimaryButton({
  children, href, variant = 'primary', type = 'button', className = '', full = false,
}: {
  children: ReactNode;
  href?: string;
  variant?: Variant;
  type?: 'button' | 'submit';
  className?: string;
  full?: boolean;
}) {
  const cls = `inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${STYLES[variant]} ${full ? 'w-full' : ''} ${className}`;
  return href ? (
    <a href={href} className={cls}>{children}</a>
  ) : (
    <button type={type} className={cls}>{children}</button>
  );
}
