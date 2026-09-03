export interface TestCase {
  id: string;
  name: string;
  fn: () => void;
}

const cases: TestCase[] = [];

export function test(id: string, name: string, fn: () => void): void {
  cases.push({ id, name, fn });
}

export function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

export function assertClose(
  actual: number,
  expected: number,
  tol: number,
  msg: string,
): void {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(
      `${msg}\n  expected ${expected} +/- ${tol}\n  actual   ${actual}\n  delta    ${actual - expected}`,
    );
  }
}

export function assertThrows(fn: () => unknown, msg: string): Error {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
  throw new Error(`${msg} — expected a throw, got none`);
}

export function runAll(): number {
  let pass = 0;
  const failures: { id: string; name: string; err: Error }[] = [];

  for (const c of cases) {
    try {
      c.fn();
      pass++;
      console.log(`  PASS  ${c.id.padEnd(6)} ${c.name}`);
    } catch (e) {
      failures.push({ id: c.id, name: c.name, err: e as Error });
      console.log(`  FAIL  ${c.id.padEnd(6)} ${c.name}`);
    }
  }

  console.log(
    `\n  ${pass}/${cases.length} passed, ${failures.length} failed\n`,
  );

  for (const f of failures) {
    console.log(`--- ${f.id} ${f.name}`);
    console.log(`${f.err.message}\n`);
  }

  return failures.length;
}
