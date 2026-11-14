/**
 * Leagues & sub-leagues V1 — allocation rule and labels.
 * Run with: npx tsx src/lib/league/divisions.test.ts
 * (The concurrency / constraint guarantees live in the database and are tested
 * against a real Postgres: supabase/tests/league_divisions.test.sh.)
 */
import {
  DIVISION_CAPACITY, divisionCode, isLeagueId, maxDivisionsFor, planDivisionAssignment,
  type DivisionSlot,
} from './divisions';
import type { LeagueId } from '../leagues';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${detail}`); }
}

/** Joins `n` players one by one into `league`, applying the plan each time. */
function fill(league: LeagueId, n: number, divisions: DivisionSlot[] = []): { divisions: DivisionSlot[]; last: string } {
  let last = '';
  for (let i = 0; i < n; i++) {
    const plan = planDivisionAssignment(league, divisions);
    if (plan.kind === 'full') { last = 'full'; continue; }
    if (plan.kind === 'create') divisions.push({ number: plan.number, memberCount: 0, capacity: DIVISION_CAPACITY });
    divisions.find((d) => d.number === plan.number)!.memberCount++;
    last = `1.${plan.number}`;
  }
  return { divisions, last };
}

check('capacity is 50', DIVISION_CAPACITY === 50);
check('label: Rookie 1.1', divisionCode(1) === '1.1' && `Rookie ${divisionCode(1)}` === 'Rookie 1.1');
check('label: Rookie 1.12', divisionCode(12) === '1.12');

// 1. First player creates 1.1, next ones share it.
{
  const first = fill('rookie', 1);
  check('first player creates Rookie 1.1', first.divisions.length === 1 && first.last === '1.1');
  const more = fill('rookie', 9, first.divisions);
  check('next players join the same sub-league', more.divisions.length === 1 && more.divisions[0].memberCount === 10);
}

// 2. 50 fill 1.1; the 51st opens 1.2; the 101st opens 1.3.
{
  const r50 = fill('rookie', 50);
  check('50 players -> one full sub-league, nothing created ahead', r50.divisions.length === 1 && r50.divisions[0].memberCount === 50);
  const r51 = fill('rookie', 1, r50.divisions);
  check('51st player -> Rookie 1.2', r51.last === '1.2' && r51.divisions.length === 2);
  const r100 = fill('rookie', 49, r51.divisions);
  check('players 1-100 -> two full sub-leagues', r100.divisions.every((d) => d.memberCount === 50) && r100.divisions.length === 2);
  const r101 = fill('rookie', 1, r100.divisions);
  check('101st player -> Rookie 1.3', r101.last === '1.3' && r101.divisions.length === 3);
}

// 3. A freed spot in a lower-numbered sub-league is filled first.
{
  const divs: DivisionSlot[] = [
    { number: 1, memberCount: 49, capacity: 50 },
    { number: 2, memberCount: 50, capacity: 50 },
    { number: 3, memberCount: 3, capacity: 50 },
  ];
  const plan = planDivisionAssignment('rookie', divs);
  check('lowest-numbered sub-league with a free spot wins', plan.kind === 'existing' && plan.number === 1);
  divs[0].memberCount = 50;
  const plan2 = planDivisionAssignment('rookie', divs);
  check('then the next one with a free spot', plan2.kind === 'existing' && plan2.number === 3);
}

// 4. Order of the input list does not matter (deterministic).
{
  const a: DivisionSlot[] = [{ number: 2, memberCount: 10, capacity: 50 }, { number: 1, memberCount: 10, capacity: 50 }];
  const p = planDivisionAssignment('rookie', a);
  check('plan is independent of list order', p.kind === 'existing' && p.number === 1);
}

// 5. Other leagues number independently; each league's list is its own.
{
  const pro = fill('pro', 51);
  const rookie = fill('rookie', 3);
  check('Pro 51 players -> Pro 1.2', pro.last === '1.2' && pro.divisions.length === 2);
  check('leagues are separate lists', rookie.divisions.length === 1 && rookie.divisions[0].memberCount === 3);
}

// 6. Elite: at most one sub-league.
{
  check('Elite allows 1 sub-league, others unlimited', maxDivisionsFor('elite') === 1 && maxDivisionsFor('rookie') === Infinity);
  const elite = fill('elite', 50);
  check('Elite 1.1 takes 50', elite.divisions.length === 1 && elite.divisions[0].memberCount === 50);
  const plan = planDivisionAssignment('elite', elite.divisions);
  check('Elite never creates a second sub-league', plan.kind === 'full');
  const more = fill('elite', 5, elite.divisions);
  check('Elite stays at one sub-league of 50', more.divisions.length === 1 && more.divisions[0].memberCount === 50);
}

// (The season a new member joins is computed in SQL from server time — covered by
// supabase/tests/league_divisions.test.sh and lib/calendar/seasonSql.test.ts.)

check('isLeagueId accepts all five, rejects others',
  ['rookie', 'amateur', 'continental', 'pro', 'elite'].every(isLeagueId) && !isLeagueId('legend'));

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
