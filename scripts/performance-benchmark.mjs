import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const at = value.indexOf('=');
  return [value.slice(0, at).replace(/^--/, ''), value.slice(at + 1)];
}));
const { chromium } = await import(args.playwright ? pathToFileURL(resolve(args.playwright)).href : 'playwright');
const runs = Number(args.runs || 15);
const url = args.url || 'http://127.0.0.1:8001';
const origin = new URL(url).origin;
const groupPath = '/vocabulary/wordbooks/guixue:10174/groups/21795/words';
const output = resolve(args.out || 'local/performance/report.json');
const screenshotDir = args.screenshots && resolve(args.screenshots);
await mkdir(resolve(output, '..'), { recursive: true });
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const sourcePaths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(path => /^(?:src\/|scripts\/|supabase\/|package(?:-lock)?\.json$|vite(?:st)?\.config\.ts$)/.test(path));
const sourceHash = createHash('sha256');
for (const path of [...new Set(sourcePaths)].sort()) { sourceHash.update(path); sourceHash.update(await readFile(resolve(path))); }
const fixturePaths = ['public/vocabulary-catalog.json', 'public/sample/questions.json', 'public/sample/speaking-questions.json', 'public/sample/speaking-samples.json'];
const fixtureFiles = await Promise.all(fixturePaths.map(path => readFile(resolve(path), 'utf8')));
const [catalog, questions, speaking, samples] = fixtureFiles.map(JSON.parse);
const env = await readFile(resolve(args.env || '.env'), 'utf8').catch(() => '');
const projectUrl = args['supabase-url'] || env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
if (!projectUrl) throw new Error('Use --env=<build env file> or --supabase-url=<build project URL> to derive the local session storage key. No credentials are sent.');
const storageKey = `sb-${new URL(projectUrl).hostname.split('.')[0]}-auth-token`;
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'benchmark@example.test', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { display_name: 'Benchmark' }, created_at: '2026-01-01T00:00:00Z', identities: [] };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: 4_102_444_800, iat: 1_760_000_000 })}.benchmark-signature`;
const session = { access_token: token, token_type: 'bearer', expires_in: 3_600_000, expires_at: 4_102_444_800, refresh_token: 'benchmark-refresh-token', user };
const rowify = rows => rows.map(payload => ({ id: String(payload.id), payload }));
const initialTables = { writing_questions: rowify(questions), speaking_topics: rowify(speaking.topics || speaking), speaking_samples: rowify(samples.samples || samples.topics || (Array.isArray(samples) ? samples : Object.entries(samples).filter(([, value]) => value && typeof value === 'object').map(([id, payload]) => ({ id, ...payload })))), word_entries: rowify(catalog.entries), wordbooks: rowify(catalog.books), wordbook_units: rowify(catalog.units.map(unit => ({ ...unit, id: `${unit.bookId}:${unit.id}`, sourceUnitId: unit.id }))), wordbook_memberships: rowify(catalog.memberships) };
const groupMembers = catalog.memberships.filter(row => row.bookId === 'guixue:10174' && row.unitId === '21795');
const firstTerm = catalog.entries.find(entry => entry.id === groupMembers[0].entryId).term;
const report = { url, expectedSourceRef: args['source-ref'] || 'working-tree', harnessWorkspaceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), harnessWorkspaceSnapshotHash: sourceHash.digest('hex'), sourceFileCount: sourcePaths.length, harnessHash: hash(await readFile(new URL(import.meta.url))), fixtureHashes: Object.fromEntries(fixturePaths.map((path, index) => [path, hash(fixtureFiles[index])])), builtAssetHashes: {}, fixture: { syntheticAccount: user.id, group: groupPath, expectedWords: groupMembers.length, authConfirmedDefinition: 'Supabase consumes the injected valid session from localStorage.', writes: 'Intercepted in memory; all non-local traffic is intercepted or blocked.' }, network: { mbps: 10, latencyMs: 150 }, cpuRate: { desktop: 1, mobile: 4 }, runs, scenarios: [] };
const percentile = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.75) - 1];
const browser = await chromium.launch({ headless: true, channel: args.browser || 'chrome' });
const scenarioSamples = new Map();

async function fixture(context, metrics) {
  const tables = structuredClone(initialTables);
  tables.profiles = [{ id: user.id, settings: { activeSkill: 'writing', skillMix: 'writing', dailyMinutes: 30, targetBand: '7', days: [1, 2, 3, 4, 5] }, active_plan_id: null, reviewed_at: null }];
  await context.route('**/*', async route => {
    const request = route.request();
    const address = new URL(request.url());
    if (address.origin === origin) return route.continue();
    const started = Date.now();
    let payload;
    const method = request.method();
    if (address.pathname.startsWith('/auth/v1/')) {
      payload = address.pathname.endsWith('/user') ? user : address.pathname.includes('/token') ? session : {};
    } else if (address.pathname.startsWith('/rest/v1/')) {
      const name = address.pathname.slice('/rest/v1/'.length);
      if (method === 'OPTIONS') payload = {};
      else if (method !== 'GET' && method !== 'HEAD') {
        metrics.writes.push({ path: address.pathname, method, rpc: name.startsWith('rpc/') });
        const body = request.postDataJSON() || {};
        if (name.startsWith('rpc/')) {
          const batch = body.batch || {};
          if (batch.profile) Object.assign(tables.profiles[0], { settings: batch.profile.settings, active_plan_id: batch.profile.activePlanId, reviewed_at: batch.profile.reviewedAt });
          payload = { id: batch.id, alreadyCommitted: false };
        } else {
          if (name === 'profiles') Object.assign(tables.profiles[0], body);
          payload = [];
        }
        metrics.persistedDailyMinutes = tables.profiles[0].settings?.dailyMinutes;
      } else {
        let rows = tables[name] || [];
        for (const [field, filter] of address.searchParams) {
          if (['select', 'order', 'offset', 'limit'].includes(field)) continue;
          const get = row => field.startsWith('payload->>') ? row.payload?.[field.slice(10)] : row[field];
          if (filter.startsWith('eq.')) rows = rows.filter(row => String(get(row)) === filter.slice(3));
          else if (filter.startsWith('in.(')) { const ids = filter.slice(4, -1).split(',').map(id => id.replace(/^"|"$/g, '')); rows = rows.filter(row => ids.includes(String(get(row)))); }
        }
        if (address.searchParams.has('order')) rows = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
        const range = request.headers().range?.match(/(\d+)-(\d+)/);
        const offset = Number(address.searchParams.get('offset') || range?.[1] || 0);
        const limit = Number(address.searchParams.get('limit') || (range ? Number(range[2]) - offset + 1 : rows.length || 1));
        rows = rows.slice(offset, offset + limit);
        payload = request.headers().accept?.includes('application/vnd.pgrst.object+json') ? rows[0] || null : rows;
      }
    } else {
      metrics.blockedExternal.push(address.pathname);
      return route.abort('blockedbyclient');
    }
    const body = JSON.stringify(payload);
    // Intercepted responses bypass the network throttle; include equivalent RTT and transfer cost.
    await new Promise(resolveDelay => setTimeout(resolveDelay, Math.max(0, 150 + Buffer.byteLength(body) / (10_000_000 / 8) * 1000 - (Date.now() - started))));
    metrics.fixtureBytes += Buffer.byteLength(body);
    metrics.fixtureRequests.push({ path: address.pathname, method, bytes: Buffer.byteLength(body) });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'content-range': '0-999/*' }, body }).catch(() => {});
  });
}

async function setup(device, authenticated) {
  const context = await browser.newContext({ viewport: device === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: device === 'mobile', timezoneId: 'Asia/Shanghai' });
  const metrics = { requests: [], writes: [], fixtureRequests: [], fixtureBytes: 0, transferredBytes: 0, blockedExternal: [] };
  await fixture(context, metrics);
  await context.addInitScript(({ authenticated, storageKey, session }) => {
    window.__benchmarkLongTasks = [];
    new PerformanceObserver(list => window.__benchmarkLongTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true });
    if (authenticated) {
      localStorage.setItem(storageKey, JSON.stringify(session));
      const original = Storage.prototype.getItem;
      Storage.prototype.getItem = function(key) { if (key === storageKey && window.__benchmarkAuthConfirmedAt === undefined) window.__benchmarkAuthConfirmedAt = performance.now(); return original.call(this, key); };
    }
  }, { authenticated, storageKey, session });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  await client.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 10_000_000 / 8, uploadThroughput: 10_000_000 / 8 });
  await client.send('Emulation.setCPUThrottlingRate', { rate: device === 'mobile' ? 4 : 1 });
  client.on('Network.requestWillBeSent', event => metrics.requests.push({ path: new URL(event.request.url).pathname, method: event.request.method }));
  client.on('Network.loadingFinished', event => { metrics.transferredBytes += event.encodedDataLength; });
  page.on('response', async response => {
    const pathname = new URL(response.url()).pathname;
    if (new URL(response.url()).origin === origin && /\.(?:js|css)$/.test(pathname) && !report.builtAssetHashes[pathname]) {
      const body = await response.body().catch(() => null);
      if (body) report.builtAssetHashes[pathname] = hash(body);
    }
  });
  return { context, page, metrics };
}

async function capture(name, device, index, page, metrics, start = 0, baseline) {
  const timing = await page.evaluate(start => {
    const now = performance.now();
    return { readyMs: now - start, navigationReadyMs: now, authConfirmedAt: window.__benchmarkAuthConfirmedAt, authReadyMs: window.__benchmarkAuthConfirmedAt === undefined ? null : now - window.__benchmarkAuthConfirmedAt, longTasks: window.__benchmarkLongTasks.filter(task => task.start >= start), navigation: performance.getEntriesByType('navigation').map(n => ({ ttfb: n.responseStart, dom: n.domContentLoadedEventEnd })), resources: performance.getEntriesByType('resource').filter(r => r.startTime >= start).map(r => ({ path: new URL(r.name).pathname, ms: r.duration, transferred: r.transferSize, decoded: r.decodedBodySize })) };
  }, start);
  const previous = baseline || { requests: 0, writes: 0, fixtureRequests: 0, fixtureBytes: 0, transferredBytes: 0 };
  const writes = metrics.writes.slice(previous.writes);
  const sample = { ...timing, longTaskCount: timing.longTasks.length, longTaskMs: timing.longTasks.reduce((total, task) => total + task.duration, 0), requests: metrics.requests.slice(previous.requests), requestCount: metrics.requests.length - previous.requests, writes, writeCount: writes.length, writeRpcCount: writes.filter(write => write.rpc).length, persistedDailyMinutes: metrics.persistedDailyMinutes, fixtureRequests: metrics.fixtureRequests.slice(previous.fixtureRequests), fixtureBytes: metrics.fixtureBytes - previous.fixtureBytes, transferredBytes: metrics.transferredBytes - previous.transferredBytes, blockedExternal: metrics.blockedExternal };
  const key = `${device}:${name}`;
  if (!scenarioSamples.has(key)) scenarioSamples.set(key, { name, device, samples: [] });
  scenarioSamples.get(key).samples.push(sample);
  if (index === 0 && screenshotDir) await page.screenshot({ path: resolve(screenshotDir, `${device}-${name}.png`), fullPage: true });
  console.log(`${device} ${name} run=${index + 1} ready=${Math.round(sample.readyMs)}ms requests=${sample.requestCount} writeRPC=${sample.writeRpcCount}`);
  return sample;
}
const counts = metrics => ({ requests: metrics.requests.length, writes: metrics.writes.length, fixtureRequests: metrics.fixtureRequests.length, fixtureBytes: metrics.fixtureBytes, transferredBytes: metrics.transferredBytes });
async function clientNavigate(page, path) { await page.evaluate(path => { history.pushState({}, '', path); window.dispatchEvent(new PopStateEvent('popstate')); }, path); }
async function settings(page) {
  await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Study settings', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Minutes a day', { exact: true }).waitFor({ state: 'visible' });
}
async function groupReady(page) {
  await page.getByLabel('Search group words', { exact: true }).waitFor({ state: 'visible', timeout: 90_000 });
  await page.getByRole('link', { name: firstTerm, exact: true }).first().waitFor({ state: 'visible', timeout: 90_000 });
  await page.getByText(`${groupMembers.length} matching words`, { exact: true }).waitFor({ state: 'visible', timeout: 90_000 });
}

try {
  for (const device of (args.devices || 'desktop,mobile').split(',')) for (let index = 0; index < runs; index += 1) {
    let run = await setup(device, false);
    try { await run.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 }); await run.page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor({ timeout: 90_000 }); await capture('cold-login', device, index, run.page, run.metrics); } finally { await run.context.close(); }
    run = await setup(device, true);
    try {
      await run.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await run.page.getByRole('button', { name: 'Account menu', exact: true }).waitFor({ timeout: 90_000 });
      await settings(run.page);
      await capture('authenticated-base-settings', device, index, run.page, run.metrics);
      const baseline = counts(run.metrics);
      await run.page.getByLabel('Minutes a day', { exact: true }).fill('35');
      const start = await run.page.evaluate(() => performance.now());
      await run.page.getByRole('button', { name: 'Save settings', exact: true }).click();
      await run.page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 90_000 });
      const saved = await capture('settings-save', device, index, run.page, run.metrics, start, baseline);
      if (!saved.writeCount || saved.persistedDailyMinutes !== 35) throw new Error('Settings save closed without an intercepted persisted settings update.');
    } finally { await run.context.close(); }
    run = await setup(device, true);
    try {
      await run.page.goto(`${url}${groupPath}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
      await groupReady(run.page);
      await capture('direct-group-words', device, index, run.page, run.metrics);
      await clientNavigate(run.page, '/account');
      await run.page.getByRole('heading', { name: 'Your account', exact: true }).first().waitFor({ timeout: 90_000 });
      const baseline = counts(run.metrics);
      const start = await run.page.evaluate(() => performance.now());
      await clientNavigate(run.page, groupPath);
      await groupReady(run.page);
      await capture('repeat-group-navigation', device, index, run.page, run.metrics, start, baseline);
    } finally { await run.context.close(); }
    run = await setup(device, true);
    try { await run.page.goto(`${url}/write`, { waitUntil: 'domcontentloaded', timeout: 90_000 }); await run.page.getByRole('textbox', { name: 'Writing answer', exact: true }).waitFor({ state: 'attached', timeout: 90_000 }); await capture('direct-writing-practice', device, index, run.page, run.metrics); } finally { await run.context.close(); }
  }
} finally {
  await browser.close();
  report.scenarios = [...scenarioSamples.values()].map(scenario => ({ ...scenario, p75Ms: percentile(scenario.samples.map(sample => sample.readyMs)), p75AuthMs: scenario.samples.every(sample => sample.authReadyMs !== null) ? percentile(scenario.samples.map(sample => sample.authReadyMs)) : null, p75LongTaskMs: percentile(scenario.samples.map(sample => sample.longTaskMs)), p75TransferredBytes: percentile(scenario.samples.map(sample => sample.transferredBytes)) }));
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
}
