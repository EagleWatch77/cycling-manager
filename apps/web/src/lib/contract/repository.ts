import { createClient } from '@/lib/supabase/server';
import type { ContractState } from './contract';

/**
 * Read-only access to the rider's contract and career history. Everything is
 * computed by the database (server clock, RLS to the caller's own rider);
 * nothing here can create or change a contract. Both readers return null /
 * [] when the migration is not deployed yet (the query errors), so the tabs
 * simply show their empty state.
 */
export interface RiderContractView {
  contractId: string;
  state: ContractState;
  startSeason: number; startWeek: number;
  endSeason: number; endWeek: number;
  durationWeeks: number;
  remainingWeeks: number;
  expiresAt: string;
}

export type CareerEventType = 'career_start' | 'contract_signed' | 'contract_ended';
export interface CareerEventView {
  id: string;
  type: CareerEventType;
  season: number; week: number;
  /** League id + sub-league number at that moment; null = not recorded (never invented). */
  league: string | null;
  divisionNumber: number | null;
  durationWeeks: number | null;
}

const seasonNo = (id: unknown): number => {
  const m = /^season-(\d+)$/.exec(String(id));
  return m ? Number(m[1]) : 0;
};

export async function getMyRiderContract(): Promise<RiderContractView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_rider_contract');
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const r = data[0];
  const state = r.state as ContractState;
  if (state !== 'active' && state !== 'expired' && state !== 'ended') return null;
  return {
    contractId: r.contract_id as string, state,
    startSeason: seasonNo(r.start_season_id), startWeek: r.start_week as number,
    endSeason: seasonNo(r.end_season_id), endWeek: r.end_week as number,
    durationWeeks: r.duration_weeks as number, remainingWeeks: r.remaining_weeks as number,
    expiresAt: r.expires_at as string,
  };
}

export async function getMyCareerEvents(riderId: string): Promise<CareerEventView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rider_career_events')
    .select('id, event_type, season_id, season_week, league, division_number, duration_weeks')
    .eq('rider_id', riderId)
    .order('occurred_at', { ascending: true })
    .order('id', { ascending: true });
  if (error || !data) return [];
  return data.flatMap((e) => {
    if (e.event_type !== 'career_start' && e.event_type !== 'contract_signed' && e.event_type !== 'contract_ended') return [];
    return [{
      id: e.id as string, type: e.event_type as CareerEventType,
      season: seasonNo(e.season_id), week: e.season_week as number,
      league: (e.league as string | null) ?? null, divisionNumber: (e.division_number as number | null) ?? null,
      durationWeeks: (e.duration_weeks as number | null) ?? null,
    }];
  });
}
