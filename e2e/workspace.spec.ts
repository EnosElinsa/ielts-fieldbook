import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixture';

test('writing status belongs to the open draft while another answer is saving', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 990 });
  const questionId = 'sample-t2-remote-work';
  let saving = false;
  let release = () => {};
  const holdSave = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rpc/commit_workspace_changes', async route => {
    const drafts = route.request().postDataJSON()?.batch?.drafts?.upserts || [];
    if (drafts.some((row: { id: string }) => row.id === questionId)) {
      saving = true;
      await holdSave;
    }
    await route.fallback();
  });
  try {
    await page.goto(`/write?questionId=${questionId}`);
    await page.getByRole('textbox', { name: 'Writing answer' }).fill('A synthetic answer.');
    await expect.poll(() => saving).toBe(true);
    await expect(page.locator('.draft-status')).toHaveText('Saving draft...');
    await page.locator('a[href="/write/questions"]').first().click();
    const otherQuestion = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Funding for public art' }) });
    await otherQuestion.getByRole('button', { name: 'Write this' }).click();
    await expect(page).toHaveURL(/questionId=sample-t2-public-art$/);
    const answer = page.getByRole('textbox', { name: 'Writing answer' });
    const status = page.locator('.draft-status');
    await expect(answer).toHaveValue('');
    await expect(status).toHaveText('Autosave enabled');
    const prompt = page.locator('#writing-prompt');
    const previousWidth = (await prompt.boundingBox())!.width;
    const layout = page.getByRole('button', { name: 'Wider prompt' });
    await layout.focus();
    await layout.press('Space');
    await expect(layout).toHaveAttribute('aria-pressed', 'true');
    expect((await prompt.boundingBox())!.width).toBeGreaterThan(previousWidth);
    await expect(status).toHaveText('Autosave enabled');
    await expect(answer).toHaveValue('');
  } finally {
    release();
  }
});

test('question bank opens a full response even while an outline remains active', async ({ page }) => {
  const questionId = 'sample-t2-remote-work';
  const outline = {
    id: 'audit-outline', kind: '2', skill: 'writing', title: 'Test outline', dateKey: '2026-11-17',
    status: 'in_progress', deskMode: 'outline', questionId, estimatedMinutes: 5,
    target: { type: 'question', skill: 'writing', mode: 'outline', questionId },
  };
  await page.route('**/rpc/load_planning_workspace', route => route.fulfill({
    json: {
      profile: { active_plan_id: outline.id, settings: { activeSkill: 'writing' } },
      plans: [{ id: outline.id, payload: outline }], planStamp: '0'.repeat(32), evidence: {},
    },
    headers: { 'access-control-allow-origin': '*' },
  }));

  await page.goto('/write');
  await expect(page.getByRole('heading', { name: 'Task 2 outline' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your position' })).toHaveAccessibleDescription(/answer the question/i);
  await expect(page.getByText('Up to 120 words')).toBeVisible();

  await page.goto('/write/questions');
  const chart = page.getByRole('article').filter({ hasText: 'Average one-way commute time' });
  await chart.getByRole('button', { name: 'Write this' }).click();
  await expect(page).toHaveURL(/\/write\?questionId=sample-t1-line-commute$/);
  await expect(page.getByRole('heading', { name: 'Full response' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Writing answer' })).toBeVisible();
  await expect(page.getByText(/^Task 1 · at least 150 words/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Writing answer' })).toBeVisible();

  await page.goto('/write');
  await expect(page.getByRole('heading', { name: 'Task 2 outline' })).toBeVisible();
});

test('historical plans are visible on direct Progress entry and after visiting Planning', async ({ page }) => {
  await page.goto('/progress?category=writing&range=all');
  await expect(page.getByText('Completed historical overview')).toBeVisible();
  await page.getByRole('link', { name: 'Planning', exact: true }).first().click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByText('Completed historical overview')).toBeVisible();
  await page.getByRole('link', { name: 'Progress', exact: true }).first().click();
  await expect(page.getByText('Completed historical overview')).toBeVisible();
});

test('cold Planning reconciles a submitted 30-prompt dictation before carrying it forward', async ({ page }) => {
  const cards = Array.from({length:30}, (_, index) => ({entryId:`saved-word-${index}`,senseId:'main'}));
  const plan = {
    id:'carried-dictation', title:'Vocabulary - Due recall', kind:'vocabulary', skill:'vocabulary',
    dateKey:'2026-11-17', originalDateKey:'2026-11-16', estimatedMinutes:30,
    origin:'automatic', status:'in_progress', startedAt:'2026-11-16T17:00:00Z', rescheduledAt:'2026-11-17T16:00:00Z',
    target:{type:'vocabulary',mode:'due-review',binding:'frozen',assessmentMode:'dictation',cards},
  };
  const completion = {
    id:'saved-dictation', planId:plan.id, mode:'dictation', status:'submitted',
    startedAt:'2026-11-16T17:02:00Z', submittedAt:'2026-11-16T17:30:00Z',
    results:cards.map(card=>({...card,response:'An attempt',result:'success'})),
  };
  await page.route('**/rpc/load_planning_workspace', route => route.fulfill({json:{
    profile:{settings:{dailyMinutes:45,activeSkill:'writing'},active_plan_id:plan.id},
    plans:[{id:plan.id,payload:plan}],planStamp:'0'.repeat(32),
  },headers:{'access-control-allow-origin':'*'}}));
  await page.route('**/rest/v1/vocabulary_sessions?*', route => {
    const params = new URL(route.request().url()).searchParams;
    return params.get('payload->>planId')?.includes(plan.id)
      ? route.fulfill({json:[completion],headers:{'access-control-allow-origin':'*'}})
      : route.fallback();
  });
  const committed = page.waitForRequest(request => request.url().endsWith('/rpc/commit_workspace_changes')
    && JSON.stringify(request.postDataJSON()?.batch?.lists?.plans?.upserts || []).includes(completion.id));
  await page.goto('/planning');
  const request = await committed;
  const batch: { lists: { plans: { upserts: { id: string; payload: unknown }[] } } } = request.postDataJSON().batch;
  expect(Object.keys(batch.lists).every(key=>key==='plans')).toBe(true);
  expect(batch.lists.plans.upserts.find(row=>row.id===plan.id)?.payload).toMatchObject({
    status:'completed',dateKey:'2026-11-16',linkedSessionId:completion.id,completedAt:completion.submittedAt,
  });
  await expect(page.locator('#task-carried-dictation')).toHaveCount(0);
});

test('a forecast review waits for its time and a manual overdue move needs confirmation', async ({page}) => {
  const base = {dateKey:'2026-11-17',status:'pending',origin:'manual',estimatedMinutes:5};
  const forecast = {...base,id:'later-review',title:'Later vocabulary review',skill:'vocabulary',kind:'vocabulary',order:-1,
    target:{type:'vocabulary',mode:'due-review',binding:'dynamic',assessmentMode:'dictation',cards:[],reviewAvailableAt:'2026-11-17T23:00:00Z'}};
  const ready = {...base,id:'ready-writing',title:'Ready writing exercise',skill:'writing',kind:'1',order:1};
  const overdue = {...ready,id:'manual-overdue',title:'Manual overdue exercise',dateKey:'2026-11-16'};
  await page.route('**/rpc/load_planning_workspace',route=>route.fulfill({json:{
    profile:{settings:{dailyMinutes:45,skills:['writing'],planning:{newWordsPerDay:0}},active_plan_id:null},
    plans:[forecast,ready,overdue].map(payload=>({id:payload.id,payload})), planStamp:'0'.repeat(32),evidence:{},
  },headers:{'access-control-allow-origin':'*'}}));

  await page.goto('/today');
  await expect(page.locator('.study-next').getByRole('heading',{name:ready.title})).toBeVisible();
  await expect(page.locator('#task-later-review').getByText('Available at 16:00')).toBeVisible();
  await expect(page.locator('#task-later-review').getByRole('button',{name:/start/i})).toHaveCount(0);
  await page.goto('/planning?view=waiting');
  const pending = page.locator('.study-selectable-task').filter({hasText:overdue.title});
  await expect(pending.getByText(/Suggested date/)).toBeVisible();
  await pending.getByRole('button',{name:'Preview move'}).click();
  const dialog = page.getByRole('dialog',{name:'Review task changes'});
  await expect(dialog.getByText('Mon 16 Nov → Tue 17 Nov · 5 min')).toBeVisible();
  await expect(dialog.getByText('Moved to fit the study budget.')).toBeVisible();
  const saved = page.waitForRequest(request=>request.url().endsWith('/rpc/commit_workspace_changes')
    && JSON.stringify(request.postDataJSON()?.batch?.lists?.plans?.upserts||[]).includes(overdue.id));
  await dialog.getByRole('button',{name:'Save task changes'}).click();
  await saved;
  await expect(dialog).toHaveCount(0);
  await expect(pending).toHaveCount(0);
  await page.getByRole('button',{name:'Schedule',exact:true}).click();
  await page.getByRole('button',{name:'Next week'}).click();
  await expect(page.getByText('Outside the current planning window').first()).toBeVisible();
});

test('a failed historical plan request can recover in place', async ({ page }) => {
  let failing = true;
  let releasePlans: () => void = () => {};
  const requestHeld = new Promise<void>(resolve => { releasePlans = resolve; });
  await page.route(url => url.pathname === '/rest/v1/plans' && Boolean(url.searchParams.get('select')?.includes('title:')), async route => {
    if (!failing) return route.fallback();
    await requestHeld;
    await route.fulfill({ status: 500, json: { message: 'Test service unavailable' }, headers: { 'access-control-allow-origin': '*' } });
  });

  await page.goto('/progress?category=writing&range=all');
  const plans = page.getByRole('region', { name: 'Study plans' });
  try {
    await expect(plans.getByText('Loading study plans…')).toBeVisible();
  } finally {
    releasePlans();
  }
  await expect(plans.getByRole('alert')).toBeVisible();
  failing = false;
  await plans.getByRole('button', { name: 'Retry plans' }).click();
  await expect(plans.getByText('Completed historical overview')).toBeVisible();
  await expect(page).toHaveURL(/\/progress\?category=writing&range=all$/);
});

test('search respects IME confirmation and real Enter still navigates', async ({ page }) => {
  await page.goto('/vocabulary');
  await page.getByRole('button', { name: /Search/ }).first().click();
  const search = page.getByRole('combobox', { name: 'Search Fieldbook' });
  await search.fill('Writing questions');
  await search.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await expect(search).toBeVisible();
  await search.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229 });
  await expect(search).toBeVisible();
  await search.press('Enter');
  await expect(page).toHaveURL(/\/write\/questions/);
});

for (const theme of ['light', 'dark']) for (const width of [320, 390, 1440]) {
  test(`${theme} ${width}px critical pages keep accessible semantics and readable layouts`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(theme => localStorage.setItem('fieldbook-theme-v1', theme), theme);
    for (const path of ['/today', '/planning', '/vocabulary', '/write/questions', '/progress', '/settings/target']) {
      await page.goto(path);
      await expect(page.locator('.view.active').first()).toBeVisible();
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 30000 });
      await expect.poll(() => page.evaluate(() => document.fonts.status), { timeout: 10_000, message: `${path} fonts` }).toBe('loaded');
      const rules = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(rules.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), `${path}: ${JSON.stringify(rules.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })))}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
      if (width < 500) expect(await page.locator('input:not([type="checkbox"]):not([type="radio"]):visible,textarea:visible').evaluateAll(elements => elements.every(e => parseFloat(getComputedStyle(e).fontSize) >= 16)), path).toBe(true);
    }
  });
}

test('mobile Practice gives equal access to all four skills and preserves active selection focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/reading');
  const practice = page.getByRole('button', { name: 'Practice: Reading', exact: true });
  await practice.click();
  for (const name of ['Listening', 'Reading', 'Writing', 'Speaking']) await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Reading', exact: true }).click();
  await expect(practice).toBeFocused();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  const more = page.getByRole('dialog', { name: 'More' });
  await expect(more.getByRole('group', { name: 'Reading' }).getByRole('button', { name: 'Questions' })).toBeVisible();
  await expect(more.getByRole('group', { name: 'Workspace' }).getByRole('button', { name: 'Settings' })).toBeVisible();
  await expect(more.getByRole('button', { name: /^(Writing|Speaking)$/ })).toHaveCount(0);
});

test.describe('English date controls under a Chinese browser locale', () => {
  test.use({ locale: 'zh-CN' });

  test('exam date can be picked with the keyboard, edited and cleared', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto('/settings/target');
    const date = page.getByRole('textbox', { name: 'Exam date', exact: true });
    const trigger = page.getByRole('button', { name: 'Open calendar for exam date' });
    await expect(date).toHaveAttribute('placeholder', 'YYYY-MM-DD');
    await trigger.click();
    const calendar = page.getByRole('dialog', { name: 'Exam date' });
    const today = calendar.getByRole('button', { name: /Today, Tuesday, 17 November 2026/ });
    await expect(today).toBeFocused();
    expect(await calendar.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await today.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(date).toHaveValue('2026-11-18');
    await expect(trigger).toBeFocused();
    await date.fill('2026-02-30');
    await date.press('Tab');
    await expect(date).toHaveValue('2026-11-18');
    await expect(page.getByText(/Use a valid date in YYYY-MM-DD format/)).toBeVisible();
    await date.fill('2026-12-01');
    await expect(date).toHaveValue('2026-12-01');
    await trigger.click();
    await calendar.getByRole('button', { name: 'Clear date' }).click();
    await expect(date).toHaveValue('');
  });
});

test('account settings, speaking, and stories keep single current nav state, contrast, and zero mobile overflow', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(t => localStorage.setItem('fieldbook-theme-v1', t), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/settings/account');
    await expect(page.getByRole('heading', { level: 2, name: 'Appearance and account' })).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 30000 });
    const rail = page.locator('.rail');
    await expect(rail.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
    await expect(rail.getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current', 'page');
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(a11y.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/settings/account', '/speak', '/stories']) {
    await page.goto(route);
    await expect(page.locator('.view.active').first()).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 30000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), route).toBe(true);
  }
});
