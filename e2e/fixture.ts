import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const user = { id: '00000000-0000-4000-8000-000000000099', aud: 'authenticated', role: 'authenticated', email: 'audit@example.test', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { display_name: 'Audit learner' }, created_at: '2026-01-01T00:00:00Z', identities: [] };
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const session = { access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: 4102444800, iat: 1760000000 })}.audit-only`, token_type: 'bearer', expires_in: 3600000, expires_at: 4102444800, refresh_token: 'synthetic-audit-token', user };
const rowify = (rows: { id: string }[]) => rows.map(payload => ({ id: String(payload.id), payload }));
const questions = JSON.parse(readFileSync('public/sample/questions.json', 'utf8'));
const speaking = JSON.parse(readFileSync('public/sample/speaking-questions.json', 'utf8'));
const headerBlock = readFileSync('public/_headers', 'utf8').split(/\r?\n\r?\n/)[0];
const securityHeaders = Object.fromEntries(headerBlock.split(/\r?\n/).slice(1).filter(line => /^\s+[^:]+:/.test(line)).map(line => { const at = line.indexOf(':'); return [line.slice(0, at).trim(), line.slice(at + 1).trim()]; }));
const oldPlan = { id: 'audit-history-task', title: 'Completed historical overview', skill: 'writing', kind: '1', dateKey: '2026-11-10', status: 'completed', origin: 'manual', estimatedMinutes: 10, completedAt: '2026-11-10T18:00:00Z' };

export const test = base.extend({
  page: async ({ page, context }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-17T19:00:00Z'));
    await context.addInitScript(({ session }) => localStorage.setItem('sb-fieldbook-audit-auth-token', JSON.stringify(session)), { session });
    const profile = { id: user.id, settings: { activeSkill: 'writing', skillMix: 'mixed', dailyMinutes: 30, days: [1, 2, 3, 4, 5], skills: ['listening', 'reading', 'writing', 'speaking'] }, active_plan_id: null, reviewed_at: null };
    const tables: Record<string, unknown[]> = { profiles: [profile], writing_questions: rowify(questions), speaking_topics: rowify(speaking.topics || speaking) };
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === 'http://127.0.0.1:5191') {
        if (url.pathname === '/api/diagnostics') return route.fulfill({ status: 204 });
        if (req.resourceType() === 'document') {
          const response = await route.fetch();
          return route.fulfill({ response, headers: { ...response.headers(), ...securityHeaders } });
        }
        return route.continue();
      }
      // All external traffic is intercepted; fixtures can never touch a real account.
      if (url.origin !== 'https://fieldbook-audit.supabase.co') return route.abort('blockedbyclient');
      const name = url.pathname.replace('/rest/v1/', '');
      let data: unknown;
      let count = 0;
      if (url.pathname.startsWith('/auth/v1/')) data = url.pathname.endsWith('/user') ? user : session;
      else if (name === 'rpc/load_planning_workspace') data = { profile, plans: [], planStamp: '0'.repeat(32), evidence: {} };
      else if (name === 'rpc/load_planning_history') data = { plans: rowify([oldPlan]), total: 1, offset: 0, planStamp: '0'.repeat(32) };
      else if (name.startsWith('rpc/')) { const body = req.postDataJSON() || {}; data = { id: body.batch?.id, alreadyCommitted: false, planStamp: '0'.repeat(32) }; }
      else if (name === 'plans' && url.searchParams.get('select')?.includes('title:')) { data = [{ id: oldPlan.id, title: oldPlan.title, dateKey: oldPlan.dateKey, status: oldPlan.status }]; count = 1; }
      else if (url.pathname.startsWith('/rest/v1/')) { const rows = tables[name] || []; data = req.headers().accept?.includes('application/vnd.pgrst.object+json') ? rows[0] || null : rows; count = rows.length; }
      else return route.abort('blockedbyclient');
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Content-Range', 'content-range': count ? `0-${count - 1}/${count}` : '*/0' }, body: JSON.stringify(data) });
    });
    await use(page);
    expect(errors, 'Unexpected browser runtime errors').toEqual([]);
  },
});
export { expect };
