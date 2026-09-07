import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/auth';
import { getAdminRiderRawById } from '@/lib/rider/adminRepository';
import type { SkillAttribute } from '@/lib/rider/config';
import { RiderAvatar } from '@/components/rider/RiderAvatar';
import { resolveAvatarSrc } from '@/lib/rider/avatarPool';

const PERFORMANCE: SkillAttribute[] = ['climbing', 'hills', 'flat', 'sprint', 'timeTrial', 'endurance', 'acceleration'];
const TACTICS: SkillAttribute[] = ['positioning', 'attackTiming', 'reaction', 'energyManagement', 'breakawaySkill'];
const TECHNIQUE: SkillAttribute[] = ['descending', 'bikeHandling', 'cornering', 'packRiding', 'wetHandling', 'roughSurface'];

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-1.5 last:border-0">
      <span className="text-sm text-navy-soft">{label}</span>
      <span className="font-mono text-sm font-semibold tabular-nums text-navy">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-card shadow-card">
      <div className="border-b border-line px-3.5 py-2 text-2xs font-bold uppercase tracking-wide text-navy-muted">
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

/**
 * Raw single-rider view — exact stored numbers, no stars/segments/hidden
 * fields. requireAdmin() + riders_select_admin RLS are the same two-layer
 * guard as the list page (see /admin/riders/page.tsx).
 */
export default async function AdminRiderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const rider = await getAdminRiderRawById(id);
  if (!rider) notFound();
  const avatarSrc = resolveAvatarSrc(rider.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <Link href="/admin/riders" className="text-2xs font-semibold text-teal hover:underline">← Rider Inspector</Link>
        <div className="mt-2 flex items-center gap-2">
          <span className="inline-block rounded bg-danger px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-white">Admin</span>
          <h1 className="text-xl font-bold text-navy">{rider.firstName} {rider.surname}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Section title="Identity">
          <Row label="firstName" value={rider.firstName} />
          <Row label="surname" value={rider.surname} />
          <Row label="age" value={rider.age} />
          <Row label="nationality" value={`${rider.countryName} (${rider.countryIso2})`} />
          <Row label="archetype (inferred)" value={rider.inferredArchetype} />
        </Section>

        <Section title="Development (raw)">
          <Row label="potential (true)" value={rider.potential} />
          <Row label="trainability" value={rider.trainability} />
          <Row label="professionalism" value={rider.professionalism} />
          <Row label="recovery" value={rider.recovery} />
          <Row label="experience" value={rider.attributes.experience} />
        </Section>

        <Section title="Performance">
          {PERFORMANCE.map((k) => <Row key={k} label={k} value={rider.attributes[k]} />)}
        </Section>

        <Section title="Tactics">
          {TACTICS.map((k) => <Row key={k} label={k} value={rider.attributes[k]} />)}
        </Section>

        <Section title="Technique">
          {TECHNIQUE.map((k) => <Row key={k} label={k} value={rider.attributes[k]} />)}
        </Section>

        <Section title="Condition">
          <Row label="energy" value={rider.condition.energy} />
          <Row label="fatigue" value={rider.condition.fatigue} />
          <Row label="form" value={rider.condition.form} />
          <Row label="fitness" value={rider.condition.fitness} />
          <Row label="morale" value={rider.condition.morale} />
        </Section>

        <Section title="Condition (previous snapshot)">
          <Row label="energy" value={rider.conditionPrevious.energy} />
          <Row label="fatigue" value={rider.conditionPrevious.fatigue} />
          <Row label="form" value={rider.conditionPrevious.form} />
          <Row label="fitness" value={rider.conditionPrevious.fitness} />
          <Row label="morale" value={rider.conditionPrevious.morale} />
        </Section>

        <Section title="Avatar">
          <div className="flex items-center gap-3 border-b border-line px-3.5 py-2 last:border-0">
            <RiderAvatar seed={rider.id} size="lg" />
            <div className="min-w-0 text-2xs text-navy-soft">
              <p><span className="font-semibold text-navy">status:</span> {avatarSrc ? 'ready' : 'fallback (empty portrait pool)'}</p>
              <p className="truncate"><span className="font-semibold text-navy">seed:</span> {rider.id}</p>
              <p className="truncate"><span className="font-semibold text-navy">src:</span> {avatarSrc ?? '—'}</p>
            </div>
          </div>
        </Section>

        <Section title="Generator / ownership metadata">
          <Row label="id" value={rider.id} />
          <Row label="player_id (owner)" value={rider.playerId ?? '— (AI filler, unowned)'} />
          <Row label="source" value={rider.isAi ? 'AI generator' : 'starter generator'} />
          <Row label="generator_version" value={rider.generatorVersion} />
          <Row label="created_at" value={new Date(rider.createdAt).toISOString()} />
        </Section>
      </div>

      <div className="rounded-card border border-warn/30 bg-warn/5 p-3.5 text-2xs text-navy-soft">
        <p className="font-semibold uppercase tracking-wide text-warn">Not stored (not fabricated here)</p>
        <p className="mt-1">
          generation seed, RNG log, the actual shape id used at generation time (only the post-hoc
          <code className="mx-1 font-mono">inferred_archetype</code>
          exists, which can disagree with the real shape), and <code className="mx-1 font-mono">updated_at</code>
          — the riders table has no updated-at column, only created_at.
        </p>
      </div>
    </div>
  );
}
