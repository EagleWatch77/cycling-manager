import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BIKE_VISUALS, bikeVisualForFrameLevel } from './visuals';
import { BIKE_EQUIPMENT_IDS, BIKE_LEVELS } from './equipment';

const keyOf = (l: number) => bikeVisualForFrameLevel(l).key;
assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(keyOf), ['steel', 'rookie', 'amateur', 'amateur', 'continental', 'continental', 'pro', 'pro', 'elite', 'elite']);
// every level 1-10 is covered exactly once
for (const l of BIKE_LEVELS) assert.equal(BIKE_VISUALS.filter((v) => v.levels.includes(l)).length, 1, `level ${l}`);
// league does not matter: the function only takes the frame level; unknown -> basic bike
assert.equal(keyOf(0), 'steel'); assert.equal(keyOf(99), 'steel');
for (const v of BIKE_VISUALS) {
  assert.ok(existsSync(join(__dirname, '../../../public', v.file)), `missing file ${v.file}`);
  for (const id of BIKE_EQUIPMENT_IDS) {
    const a = v.anchors[id];
    assert.ok(a.x > 0 && a.x < 1 && a.y > 0 && a.y < 1, `${v.key}.${id}`);
  }
  // right-side parts must lie right of the drivetrain anchor (sanity of orientation)
  assert.ok(v.anchors.brakes.x > v.anchors.drivetrain.x && v.anchors.wheels.x > v.anchors.frame.x);
}
assert.equal(BIKE_VISUALS.filter((v) => v.temporary).length, 0);
assert.equal(new Set(BIKE_VISUALS.map((v) => v.file)).size, 6); // six different pictures
console.log('visuals OK');
