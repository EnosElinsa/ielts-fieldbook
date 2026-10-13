import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const index = value.indexOf('=');
  return [value.slice(0, index).replace(/^--/, ''), value.slice(index + 1)];
}));
if (!args.baseline || !args.optimized || !args.out) throw new Error('Use --baseline=<report> --optimized=<report> --out=<summary>.');
const read = async path => JSON.parse(await readFile(resolve(path), 'utf8'));
const baseline = await read(args.baseline); const optimized = await read(args.optimized);
if (JSON.stringify(baseline.fixtureHashes) !== JSON.stringify(optimized.fixtureHashes)) throw new Error('Fixture versions differ.');
if (JSON.stringify(baseline.network) !== JSON.stringify(optimized.network) || JSON.stringify(baseline.cpuRate) !== JSON.stringify(optimized.cpuRate)) throw new Error('Measurement environments differ.');
for (const report of [baseline, optimized]) {
  if (report.runs !== 15 || report.scenarios.length !== 12 || report.scenarios.some(scenario => scenario.samples.length !== 15)) throw new Error('Expected 15 runs for all six desktop/mobile scenarios.');
  if (report.scenarios.some(scenario => scenario.samples.some(sample => sample.blockedExternal.length))) throw new Error('Unexpected blocked external traffic.');
}
const compact = report => ({
  url: report.url, sourceRef: report.expectedSourceRef, sourceSnapshotHash: report.harnessWorkspaceSnapshotHash,
  harnessHash: report.harnessHash, builtAssetHashes: report.builtAssetHashes, fixtureHashes: report.fixtureHashes,
  network: report.network, cpuRate: report.cpuRate, runs: report.runs, fixture: report.fixture,
  scenarios: report.scenarios.map(({name,device,p75Ms,p75AuthMs,p75LongTaskMs,p75TransferredBytes,samples}) => ({
    name,device,p75Ms,p75AuthMs,p75LongTaskMs,p75TransferredBytes,
    samples:samples.map(({readyMs,authReadyMs,requestCount,transferredBytes,longTaskMs,writeCount,writeRpcCount}) => ({readyMs,authReadyMs,requestCount,transferredBytes,longTaskMs,writeCount,writeRpcCount})),
  })),
});
const comparisons = optimized.scenarios.map(scenario => {
  const before = baseline.scenarios.find(row => row.name === scenario.name && row.device === scenario.device);
  if (!before) throw new Error('Scenario sets differ.');
  return { name:scenario.name, device:scenario.device, baselineMs:before.p75Ms, optimizedMs:scenario.p75Ms, improvementPercent:100*(1-scenario.p75Ms/before.p75Ms) };
});
const summary = { baseline:compact(baseline), optimized:compact(optimized), comparisons };
if (args.online) summary.onlineColdBaseline = compact(await read(args.online));
const output = resolve(args.out);
await mkdir(dirname(output), {recursive:true});
await writeFile(output, JSON.stringify(summary, null, 2)+'\n');
console.table(comparisons.map(row => ({...row,baselineMs:Math.round(row.baselineMs),optimizedMs:Math.round(row.optimizedMs),improvementPercent:Math.round(row.improvementPercent)})));
