import assert from 'node:assert/strict';
import { statesFromBikeRow } from './states';

assert.deepEqual(statesFromBikeRow({ tires: 100, brakes: 100, drivetrain: 100, frame: 100, wheels: 100 }), { frame: 100, wheels: 100, tires: 100, brakes: 100, drivetrain: 100 });
// before the migration: frame/wheels are absent -> null (dash), the three real ones are kept as they are
assert.deepEqual(statesFromBikeRow({ tires: 35, brakes: 20, drivetrain: 60 }), { frame: null, wheels: null, tires: 35, brakes: 20, drivetrain: 60 });
assert.deepEqual(statesFromBikeRow({ tires: 90, brakes: 10, drivetrain: 40, frame: 70, wheels: 40 }), { frame: 70, wheels: 40, tires: 90, brakes: 10, drivetrain: 40 });
assert.deepEqual(statesFromBikeRow(null), { frame: null, wheels: null, tires: null, brakes: null, drivetrain: null });
assert.equal(statesFromBikeRow({ frame: null }).frame, null);
assert.equal(statesFromBikeRow({ frame: 120 }).frame, 100); // clamped for display only
console.log('states OK');
