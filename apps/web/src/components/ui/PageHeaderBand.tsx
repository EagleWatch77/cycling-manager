import Image from 'next/image';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Common compact page header (replaces the tall panoramic banner on pages that
 * adopt it; Rebríčky first): green icon tile, bold navy title, small meta line
 * (season / week), and the existing cycling panorama (/topbar.png) at the right
 * fading into the light-green background. Low and elegant, ~72px on desktop.
 */
export function PageHeaderBand({ icon, title, meta }: { icon: string; title: string; meta?: ReactNode }) {
  return (
    <header className="relative flex min-h-[72px] items-center overflow-hidden rounded-card border border-line bg-mint-sub shadow-card">
      <div className="relative z-10 flex items-center gap-3 px-4 py-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal text-white">
          <Icon name={icon} className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-page text-navy">{title}</h1>
          {meta && <p className="text-2xs font-semibold text-navy-soft">{meta}</p>}
        </div>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-3/5 sm:block"
        style={{ WebkitMaskImage: 'linear-gradient(to right, transparent, #000 45%)', maskImage: 'linear-gradient(to right, transparent, #000 45%)' }}
      >
        <Image src="/topbar.png" alt="" fill sizes="60vw" className="object-cover" style={{ objectPosition: 'right 46%' }} />
      </div>
    </header>
  );
}
