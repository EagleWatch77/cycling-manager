/**
 * S1 + O5 is switched OFF (rollback of the working model: capSlope 1.25, youthRoomFloor 0). Run: npx tsx --tsconfig tsconfig.json src/lib/training/development/youthRoom.test.ts
 * This file replaces the S1+O5 version while the working model is rolled back; the S1+O5 version is restored by reverting the patch (docs/S1O5_rollback_postup.md).
 */
import { DEV_CONFIG } from './config';
import { roomPhys, softCap, youthRoomFloor } from './core';
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}  ${d}`); } };
check('capSlope is back to 1.25 (cap 80 + 125 x (Pot/100)^2)', DEV_CONFIG.capSlope === 1.25 && DEV_CONFIG.capBase === 80 && DEV_CONFIG.capExp === 2);
check('cap values Pot 20/50/75/90/95/100 = 85/111/150/181/193/205', [20, 50, 75, 90, 95, 100].map((p) => Math.round(softCap(p))).join() === '85,111,150,181,193,205');
check('youthRoomFloor is back to 0 (no youth floor)', DEV_CONFIG.youthRoomFloor === 0);
check('the floor is 0 at every age', [15, 17, 21, 23, 25, 26, 40].every((a) => youthRoomFloor(a) === 0));
check('room with an age equals the room without an age (no floor)', [17, 21, 23, 30].every((age) => roomPhys(150, 90, DEV_CONFIG, age) === roomPhys(150, 90, DEV_CONFIG) && roomPhys(80, 120, DEV_CONFIG, age) === roomPhys(80, 120, DEV_CONFIG)));
check('above the ceiling a young rider has practically no room again (< 0.001)', roomPhys(150, 90, DEV_CONFIG, 19) < 0.001);
check('hard maximum stays 200 (room 0 at 200 and above)', DEV_CONFIG.maxAttribute === 200 && roomPhys(200, 90, DEV_CONFIG, 17) === 0 && roomPhys(201, 300, DEV_CONFIG, 17) === 0);
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
