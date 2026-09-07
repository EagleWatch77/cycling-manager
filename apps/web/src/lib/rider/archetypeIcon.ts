const ARCHETYPE_ICON: Record<string, string> = {
  climber: 'mountain',
  sprinter: 'bolt',
  puncheur: 'flag',
  rouleur: 'wheel',
  classics: 'chain',
  allrounder: 'trophy',
  timeTrial: 'chart',
};

/** Small consistent glyph for a rider archetype, reusing the existing outline Icon set — no new per-archetype artwork. */
export function archetypeIcon(archetype: string): string {
  return ARCHETYPE_ICON[archetype] ?? 'rider';
}
