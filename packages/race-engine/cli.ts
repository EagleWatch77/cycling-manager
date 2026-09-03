/**
 * CLI harness. No web, no DB, no auth.
 *   npx tsx cli.ts pace   — Group Pace scenario matrix + batch load benchmark
 *   npx tsx cli.ts test   — unit test suite
 *   npx tsx cli.ts gaps   — report unresolved design gaps
 */
export {};

const cmd = process.argv[2] ?? "pace";

if (cmd === 'pace') {
  await import('./bench/run.js');
} else if (cmd === 'test') {
  await import('./test/run.js');
} else if (cmd === 'gaps') {
  const { unvalidatedTerrains } = await import('./src/config/segmentSkills.js');
  const { UNSPECIFIED_REQUIRED_PERFORMANCE, isRequiredPerformanceSpecified } =
    await import('./src/core/struggle.js');
  console.log('\nUNRESOLVED DESIGN GAPS\n');
  console.log(
    `  RP-01  BLOCKING      RequiredPerformance(G) derivation undefined  ` +
      `(specified: ${isRequiredPerformanceSpecified(UNSPECIFIED_REQUIRED_PERFORMANCE)})`,
  );
  console.log(
    `  TC-01  non-blocking  unvalidated skill weights: ${unvalidatedTerrains().join(', ')}`,
  );
  console.log('  EP-01  non-blocking  SmallVariance per-segment amplitude undefined');
  console.log('\n  See docs/DESIGN_GAPS.md\n');
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(1);
}
