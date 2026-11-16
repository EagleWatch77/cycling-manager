import assert from 'node:assert/strict';
import { BIKE_EQUIPMENT_IDS, BIKE_LEVELS, LEAGUE_MAX_BIKE_LEVEL, frameMaterial, isLevelAvailable, unlockLeague, upgradeLevels, isBikeEquipmentId, BIKE_PROPERTIES } from './equipment';
import { LEAGUES } from '@/lib/leagues';

assert.equal(BIKE_EQUIPMENT_IDS.length, 5);
assert.equal(BIKE_LEVELS.length, 10);
assert.deepEqual(LEAGUES.map((l) => LEAGUE_MAX_BIKE_LEVEL[l]), [2, 4, 6, 8, 10]);
assert.ok(isLevelAvailable(2, 'rookie') && !isLevelAvailable(3, 'rookie'));
assert.ok(isLevelAvailable(4, 'amateur') && !isLevelAvailable(5, 'amateur'));
assert.equal(unlockLeague(1), 'rookie'); assert.equal(unlockLeague(3), 'amateur'); assert.equal(unlockLeague(7), 'pro'); assert.equal(unlockLeague(10), 'elite'); assert.equal(unlockLeague(11), null);
assert.deepEqual(upgradeLevels(8), [9, 10]); assert.deepEqual(upgradeLevels(10), []);
assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(frameMaterial), ['steel', 'aluminium', 'aluminiumPlus', 'aluminiumPlus', 'carbonBasic', 'carbonBasic', 'carbonPerformance', 'carbonPerformance', 'carbonRace', 'carbonRace']);
assert.ok(isBikeEquipmentId('brakes') && !isBikeEquipmentId('x') && !isBikeEquipmentId(null));
for (const id of BIKE_EQUIPMENT_IDS) assert.equal(BIKE_PROPERTIES[id].length, 3);
console.log('equipment OK');
