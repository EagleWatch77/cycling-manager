/**
 * Single-source icon set. Keys match `NavItem.icon` and equipment slot icons so
 * navigation stays data-driven and no component hardcodes an SVG path.
 */
const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V21H3z',
  rider: 'M12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 21v-1a8 8 0 0 1 16 0v1',
  flag: 'M5 3v18M5 4h11l-2 4 2 4H5',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  chart: 'M5 20V10M12 20V4M19 20v-7',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM4 5h3M17 5h3M9 20h6M12 14v6',
  team: 'M9 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20v-1a7 7 0 0 1 14 0v1M17 9a3 3 0 1 0 0-6M22 20v-1a6 6 0 0 0-4-5.7',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  swap: 'M7 4v13M7 4 4 7M7 4l3 3M17 20V7M17 20l3-3M17 20l-3-3',
  staff: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 21v-2a7 7 0 0 1 14 0v2',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v10M9.5 9.5h5M9.5 14.5h5',
  building: 'M4 21V6l8-3 8 3v15M9 21v-5h6v5M8 10h2M14 10h2',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.9 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 13.9H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9.3A1.6 1.6 0 0 0 10.4 4V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9.3a1.6 1.6 0 0 0 1.5 1.1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.1z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  heart: 'M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7L12 21l8.8-8.4a5 5 0 0 0 0-7z',
  euro: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 8.5a3.5 3.5 0 0 0-5.7 1.2M15 15.5a3.5 3.5 0 0 1-5.7-1.2M8 11h5M8 13.5h5',
  pin: 'M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  mountain: 'm3 19 6-10 3.5 6 2-3.2L21 19z',
  cloud: 'M17.5 19a4.5 4.5 0 0 0 .3-9 6 6 0 0 0-11.6 1.6A3.7 3.7 0 0 0 7 19z',
  frame: 'M6.5 18.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM17.5 18.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM6.5 15 10 8h5l2.5 7M9 8h6',
  wheel: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 21V3M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4',
  chain: 'M9 12a3 3 0 0 1 3-3h2a3 3 0 0 1 0 6h-2M15 12a3 3 0 0 1-3 3h-2a3 3 0 0 1 0-6h2',
  helmet: 'M4 15a8 8 0 0 1 16 0zM3 15h18v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  cart: 'M4 4h2l2.4 12.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H7M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM17 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  crown: 'M4 18h16l-1.2-8.5L14 12l-2-6.5L10 12 5.2 9.5 4 18zM4 18v2h16v-2',
};

export function Icon({ name, className = 'h-4 w-4' }: { name: string; className?: string }) {
  const d = PATHS[name] ?? PATHS.home;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
