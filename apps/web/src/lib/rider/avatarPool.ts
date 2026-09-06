import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Rider Avatar V1 — complete portrait pool.
 *
 * V1 uses whole pre-rendered portraits (no face/hair/beard layering — that
 * experiment lives under public/avatars/male{,-hair,-beard}/ and is unused
 * here). Adding more portraits later means dropping numbered PNGs into
 * male-complete/; nothing in this file or the generator needs to change.
 */

const AVATAR_DIR = path.join(process.cwd(), 'public', 'avatars', 'male-complete');
const PUBLIC_BASE = '/avatars/male-complete';

let cachedPool: string[] | null = null;

/** Numbered PNGs (1.png, 2.png, ...) currently present, sorted numerically. */
function listAvatarFiles(): string[] {
  if (cachedPool) return cachedPool;

  let entries: string[] = [];
  try {
    entries = fs.readdirSync(AVATAR_DIR);
  } catch {
    entries = [];
  }

  cachedPool = entries
    .filter((f) => /^\d+\.png$/i.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  return cachedPool;
}

/** Deterministic FNV-1a string hash — no Math.random, stable across runs. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The portrait URL for a given rider/avatar seed, or null if no portraits
 * exist yet. Same seed always yields the same portrait.
 */
export function resolveAvatarSrc(seed: string): string | null {
  const pool = listAvatarFiles();
  if (pool.length === 0) return null;

  const index = hashSeed(seed) % pool.length;
  return `${PUBLIC_BASE}/${pool[index]}`;
}
