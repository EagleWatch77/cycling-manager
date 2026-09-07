import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { generateAiRider } from './generateAi';
import { archetypeForSlot, aiFillersNeeded, MINIMUM_RACE_FIELD } from './aiConfig';

/**
 * Admin/test-only action: fill the current rider pool up to the minimum race
 * field size with generated AI Rookies. See aiConfig.ts for the field-size
 * rule and the archetype mix.
 *
 * Idempotent by design (rule: prevent accidental duplicate generation):
 * if any AI rider already exists, nothing new is generated.
 */
export interface GenerateTestPelotonResult {
  created: number;
  realRiders: number;
  aiRiders: number;
  skippedReason: 'field-full' | 'already-generated' | null;
}

export async function generateTestPeloton(): Promise<GenerateTestPelotonResult> {
  const supabase = await createClient();

  const [{ count: realCount }, { count: aiCount }] = await Promise.all([
    supabase.from('riders').select('id', { count: 'exact', head: true }).eq('is_ai', false),
    supabase.from('riders').select('id', { count: 'exact', head: true }).eq('is_ai', true),
  ]);

  const real = realCount ?? 0;
  const existingAi = aiCount ?? 0;

  if (real >= MINIMUM_RACE_FIELD) {
    return { created: 0, realRiders: real, aiRiders: existingAi, skippedReason: 'field-full' };
  }
  if (existingAi > 0) {
    return { created: 0, realRiders: real, aiRiders: existingAi, skippedReason: 'already-generated' };
  }

  const needed = aiFillersNeeded(real);
  const rows = Array.from({ length: needed }, (_, i) => {
    const rider = generateAiRider(Math.random, archetypeForSlot(i));
    return {
      player_id: null,
      is_ai: true,
      first_name: rider.firstName,
      surname: rider.surname,
      country_name: rider.countryName,
      country_iso2: rider.countryIso2,
      age: rider.age,
      attributes: rider.attributes,
      condition: rider.condition,
      condition_previous: rider.condition,
      inferred_archetype: rider.archetype,
      potential: rider.potential,
      trainability: rider.trainability,
      professionalism: rider.professionalism,
      recovery: rider.recovery,
      generator_version: rider.generatorVersion,
    };
  });

  const { data, error } = await supabase.from('riders').insert(rows).select('id');
  if (error) throw new Error(`Failed to generate AI test peloton: ${error.message}`);

  const createdCount = data?.length ?? 0;
  return { created: createdCount, realRiders: real, aiRiders: existingAi + createdCount, skippedReason: null };
}
