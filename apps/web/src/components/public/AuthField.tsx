import type { ReactNode } from 'react';

/** One labelled form control. The label is always real and always tied to the input. */
export function AuthField({
  id, label, type = 'text', autoComplete, placeholder, hint, required = true, children,
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  children?: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between pb-1 text-xs font-semibold text-navy">
        {label}
        {hint && <span className="text-2xs font-normal text-navy-muted">{hint}</span>}
      </label>
      {children ?? (
        <input
          id={id}
          name={id}
          type={type}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-navy placeholder:text-navy-muted/70 focus-visible:border-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        />
      )}
    </div>
  );
}
