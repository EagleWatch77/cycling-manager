import { notFound } from 'next/navigation';
import { getServerDictionary } from '@/i18n/server';
import { visibleStages } from '@/lib/leagues';
import { km } from '@/lib/format';
import { DANUBE_META, DANUBE_STAGES } from '@/data/danube';
import { getMyRider } from '@/lib/rider/repository';
import { getMySeasonRegistrations, listStartList } from '@/lib/races/registration';
import { getCurrentSeasonInfo } from '@/lib/calendar/season';
import { getSeasonSchedule, getSelectionState } from '@/data/tourSchedule';
import { MAXIMUM_RACE_FIELD } from '@/lib/rider/aiConfig';
import { AppShell } from '@/components/AppShell';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { RiderAvatar } from '@/components/rider/RiderAvatar';
import { StageProfile } from '@/components/races/StageProfile';
import { StageScoring } from '@/components/races/StageScoring';
import { JerseyIcon, type JerseyKind } from '@/components/races/JerseyIcon';
import { registerForTourAction } from './actions';

const LEAGUE = 'rookie' as const;

const JERSEYS: { kind: JerseyKind; nameKey: string }[] = [
  { kind: 'gc', nameKey: 'jersey.gc' },
  { kind: 'points', nameKey: 'jersey.points' },
  { kind: 'mountain', nameKey: 'jersey.mountain' },
  { kind: 'youth', nameKey: 'jersey.youth' },
  // Team jersey exists but is only shown in leagues with teams (not Rookie).
];

const SDIFF: Record<string, string> = {
  flat: 'sdiff.flat', hilly: 'sdiff.hilly', itt: 'sdiff.itt', mountain: 'sdiff.mountain',
};
const SHINT: Record<string, string> = {
  flat: 'shint.flat', hilly: 'shint.hilly', itt: 'shint.itt', mountain: 'shint.mountain',
};

/**
 * Tour detail. Only Danube exists as canonical data today, so any other id
 * 404s rather than rendering an empty shell. Stages are filtered by league:
 * a Rookie sees stages 1–3, higher ones are not rendered at all.
 *
 * No weather here — that is race-instance data, not a Tour property.
 */
export default async function TourDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== DANUBE_META.id) notFound();

  const { t, locale } = await getServerDictionary();
  const stages = visibleStages(DANUBE_STAGES, LEAGUE);
  const totalKm = stages.reduce((s, x) => s + x.km, 0);

  const rider = await getMyRider();
  const season = getCurrentSeasonInfo();
  const seasonViews = getSeasonSchedule(season);
  const myRegistrations = rider ? await getMySeasonRegistrations(seasonViews.map((v) => v.tour.id)) : [];
  const selectedTourIds = new Set(myRegistrations.map((r) => r.tourId));
  const selectionState = getSelectionState(DANUBE_META.id, seasonViews, selectedTourIds);
  const startList = await listStartList(DANUBE_META.id);
  const registerForThisTour = registerForTourAction.bind(null, DANUBE_META.id);

  return (
    <AppShell activeId="races" locale={locale}>
      <div className="space-y-3">
        <a href="/races" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-soft hover:text-navy">
          <Icon name="rider" className="h-4 w-4 rotate-180 opacity-0" />
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('detail.back')}
        </a>

        <div className="grid grid-cols-12 gap-3">
          {/* Left: hero + stages */}
          <div className="col-span-12 space-y-3 lg:col-span-8">
            <Card dense>
              <div className="relative h-44 w-full overflow-hidden rounded-t-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={DANUBE_META.image} alt="" className="h-full w-full object-cover object-right" />
                <div className="absolute inset-0 bg-gradient-to-r from-card via-card/75 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-center p-5">
                  <h1 className="text-3xl font-bold leading-tight text-navy">{DANUBE_META.name}</h1>
                  <p className="mt-1 max-w-xs text-xs text-navy-soft">{DANUBE_META.tagline}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-2xs font-semibold text-navy">
                      {t('raceType.mixed')}
                    </span>
                    <span className="rounded-lg border border-line bg-card px-2.5 py-1 text-2xs font-semibold text-navy">
                      {t('detail.stages')}: {stages.length}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {stages.map((s) => (
              <Card key={s.number} dense>
                <div className="flex flex-col gap-3 p-3.5 md:flex-row md:items-center">
                  <div className="flex items-center gap-3 md:w-52 md:shrink-0">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy text-lg font-bold text-white">
                      {s.number}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-navy">{s.from} → {s.to}</p>
                      <p className="text-xs text-navy-soft">
                        {km(s.km, locale)}
                        <span className="ml-1.5 rounded bg-teal-rail px-1.5 py-0.5 text-[10px] font-bold text-teal-dark">
                          {t(SDIFF[s.difficulty])}
                        </span>
                      </p>
                      <p className="mt-0.5 text-2xs text-navy-muted">{t(SHINT[s.difficulty])}</p>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="mb-1 flex justify-between text-2xs text-navy-muted">
                      <span>{s.from} · {s.startM} m</span>
                      <span>{s.to} · {s.endM} m</span>
                    </div>
                    <StageProfile stage={s} />
                    <StageScoring t={t} stage={s} />
                  </div>
                </div>
              </Card>
            ))}

            <p className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-2xs text-navy-muted">
              <Icon name="bell" className="h-3.5 w-3.5" />
              {t('detail.note')}
            </p>
          </div>

          {/* Right: summary + jerseys */}
          <div className="col-span-12 space-y-3 lg:col-span-4">
            <Card title={t('detail.tourSummary')} dense>
              <div className="grid grid-cols-2 gap-px bg-line">
                <Summary label={t('detail.totalDistance')} value={km(totalKm, locale)} icon="flag" />
                <Summary label={t('detail.stages')} value={String(stages.length)} icon="flag" />
                <div className="col-span-2 bg-card p-3">
                  <span className="flex items-center gap-2 text-2xs text-navy-muted">
                    <Icon name="mountain" className="h-4 w-4" /> {t('detail.raceType')}
                  </span>
                  <span className="mt-0.5 block text-lg font-bold text-navy">{t('raceType.mixed')}</span>
                </div>
              </div>
            </Card>

            <Card title={t('detail.jerseys')} dense>
              <ul className="p-3.5">
                {JERSEYS.map((j) => (
                  <li key={j.kind} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
                    <JerseyIcon kind={j.kind} className="h-10 w-9" />
                    <span className="text-sm font-semibold text-navy">{t(j.nameKey)}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card dense>
              <div className="p-3.5">
                {!rider ? (
                  <a href="/login"
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-rail px-3 py-2 text-sm font-semibold text-teal-dark">
                    {t('detail.loginToRegister')}
                  </a>
                ) : selectionState === 'selected' ? (
                  <button type="button" disabled
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-rail px-3 py-2 text-sm font-semibold text-teal-dark">
                    <Icon name="flag" className="h-4 w-4" />
                    {t('detail.registered')}
                  </button>
                ) : selectionState === 'available' ? (
                  <form action={registerForThisTour}>
                    <button type="submit"
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-dark">
                      <Icon name="flag" className="h-4 w-4" />
                      {t('detail.registerRider')}
                    </button>
                  </form>
                ) : (
                  <button type="button" disabled
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-rail px-3 py-2 text-sm font-semibold text-navy-muted/70">
                    {t(selectionState === 'overlap' ? 'races.dateOverlap' : 'races.limitReached')}
                  </button>
                )}
              </div>
            </Card>

            <Card
              title={t('detail.startList')}
              action={
                <span className="text-2xs font-bold text-navy-muted">
                  {t('detail.startListCount', { n: startList.length, max: MAXIMUM_RACE_FIELD })}
                </span>
              }
              dense
            >
              <ul className="p-1.5">
                {startList.map((s) => (
                  <li key={s.riderId} className="flex items-center gap-3 px-2 py-2">
                    <RiderAvatar seed={s.riderId} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy">{s.firstName} {s.surname}</p>
                      <p className="text-2xs text-navy-muted">{s.countryName} · {t('rider.age')} {s.age}</p>
                    </div>
                  </li>
                ))}
                {startList.length === 0 && (
                  <li className="px-2 py-3 text-sm text-navy-soft">{t('races.noneEntered')}</li>
                )}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Summary({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-card p-3">
      <span className="flex items-center gap-1.5 text-2xs text-navy-muted">
        <Icon name={icon} className="h-3.5 w-3.5" /> {label}
      </span>
      <span className="mt-0.5 block text-xl font-bold text-navy">{value}</span>
    </div>
  );
}
