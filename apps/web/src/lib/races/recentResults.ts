import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { TOURS } from '@/data/tours';

export interface RecentResult {
  id: string;
  tourName: string;
  position: number;
  points: number;
}

/**
 * The rider's own latest recorded race results (public.race_results, read
 * only; RLS allows reading results). Returns [] when there are none or the
 * query fails - nothing is ever invented. Today nothing writes results yet,
 * so the Home window shows its empty dash until a results pipeline exists.
 */
export async function getMyRecentResults(riderId: string, limit = 3): Promise<RecentResult[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('race_results')
    .select('id, tour_id, position, points')
    .eq('rider_id', riderId)
    .order('recorded_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    tourName: TOURS.find((t) => t.id === r.tour_id)?.name ?? String(r.tour_id),
    position: r.position as number,
    points: r.points as number,
  }));
}
