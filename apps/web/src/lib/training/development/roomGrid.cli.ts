/** Reference grid for the SQL parity test of public.dev_phys_room(): prints [{cur,cap,age,room}] computed by roomPhys() (S1 + O5). */
import { DEV_CONFIG } from './config';
import { roomPhys } from './core';
const out: { cur: number; cap: number; age: number; room: number }[] = [];
for (const age of [16, 17, 20, 21, 22, 23, 24, 25, 26, 27, 35]) for (const cap of [40, 86, 118, 164, 202, 230]) for (const cur of [1, 40, 80, 100, 130, 164, 199, 200, 201]) out.push({ cur, cap, age, room: roomPhys(cur, cap, DEV_CONFIG, age) });
console.log(JSON.stringify(out));
