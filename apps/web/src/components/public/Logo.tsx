import Image from 'next/image';

/**
 * Brand wordmark. The asset already contains the words "Cycling Manager", so
 * anywhere this appears the heading text must not repeat them.
 */
export function Logo({
  className = '', width = 260, priority = false,
}: {
  className?: string;
  width?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.webp"
      alt="Cycling Manager"
      width={width}
      height={Math.round(width / 3.149)}
      priority={priority}
      className={className}
    />
  );
}
