import Link from 'next/link';
import { getServerDictionary } from '@/i18n/server';
import sk from '@/i18n/messages/sk.json';
import { getMyRider } from '@/lib/rider/repository';
import { findMyBikeComponentStates } from '@/lib/facilities/bike';
import { getMyLeague } from '@/lib/facilities/repository';
import { buildComponentView } from '@/lib/facilities/bikeDisplay';
import { BASE_BIKE_LEVEL, BIKE_EQUIPMENT_IDS, isBikeEquipmentId, type BikeEquipmentId } from '@/lib/bike/equipment';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { BikeWorkshop, type WorkshopComponent } from '@/components/bike/BikeWorkshop';

/** Only the bike page's own keys travel to the client component. */
const CLIENT_KEY = /^(bikePage\.|league\.|bikeCard\.status)/;

/**
 * Môj bicykel — detail page (C-059). Visual skeleton + level system: the page
 * only READS the existing bike_condition values (tires/brakes/drivetrain; wheels
 * and frame have none) and shows wear as 0 % = new. Component levels are not
 * stored yet, so every component shows the base level; nothing is purchased,
 * serviced or written here.
 */
export default async function BikePage({ searchParams }: { searchParams: Promise<{ component?: string; previewFrame?: string }> }) {
  const { t } = await getServerDictionary();
  const { component, previewFrame } = await searchParams;
  const initial: BikeEquipmentId = isBikeEquipmentId(component) ? component : 'frame';
  const rider = await getMyRider();
  const [bike, league] = await Promise.all([rider ? findMyBikeComponentStates(rider.id) : Promise.resolve(null), getMyLeague()]);

  const wearOf = (condition: number | null) => buildComponentView({ id: 'tires', condition, level: BASE_BIKE_LEVEL });
  const stored: Record<BikeEquipmentId, number | null> = {
    frame: bike?.frame ?? null, wheels: bike?.wheels ?? null, tires: bike?.tires ?? null, brakes: bike?.brakes ?? null, drivetrain: bike?.drivetrain ?? null,
  };
  const components: WorkshopComponent[] = BIKE_EQUIPMENT_IDS.map((id) => {
    const v = wearOf(stored[id]);
    return { id, level: BASE_BIKE_LEVEL, wear: v.wear, status: v.status };
  });

  // DEV-ONLY preview of a higher bike picture (?previewFrame=6). Ignored in production builds; never stored.
  const preview = process.env.NODE_ENV !== 'production' ? Number(previewFrame) : NaN;
  const devPreview = Number.isInteger(preview) && preview >= 1 && preview <= 10;
  if (devPreview) {
    const frame = components.find((c) => c.id === 'frame');
    if (frame) frame.level = preview;
  }

  const messages: Record<string, string> = {};
  for (const key of Object.keys(sk)) if (CLIENT_KEY.test(key)) messages[key] = t(key);

  return (
    <AppShell activeId="facilities">
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-rail text-teal"><Icon name="frame" className="h-6 w-6" /></span>
        <div>
          <nav aria-label="breadcrumb" className="text-xs font-medium text-navy-muted">
            <Link href="/dashboard" className="hover:text-teal">{t('nav.home')}</Link> <span aria-hidden="true">›</span> <span className="text-navy">{t('bikePage.title')}</span>
          </nav>
          <h1 className="text-page text-navy">{t('bikePage.title')}</h1>
          <p className="text-sm font-medium text-navy-soft">{t('bikePage.subtitle')}</p>
        </div>
      </div>
      <div className="mt-3">
        {rider ? (
          <BikeWorkshop components={components} league={league} messages={messages} initialSelected={initial} weightKg={null} kilometres={null} devPreview={devPreview} />
        ) : (
          <EmptyState icon="chain" text={t('equipment.bikeEmpty')} />
        )}
      </div>
    </AppShell>
  );
}
