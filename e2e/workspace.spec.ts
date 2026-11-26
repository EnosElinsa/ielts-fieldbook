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

test('mobile planning preserves accessible day headings, account inputs honor hover borders, mobile search avoids zoom, and reduced motion stops spatial transitions', async ({ page }) => {
  const futurePlan = {
    id: 'future-mobile-heading', title: 'Tomorrow writing essay', skill: 'writing', kind: '2',
    dateKey: '2026-11-18', status: 'in_progress', origin: 'manual', estimatedMinutes: 40,
  };
  await page.route('**/rpc/load_planning_workspace', route => route.fulfill({
    json: {
      profile: { settings: { dailyMinutes: 45, skills: ['writing'], planning: { newWordsPerDay: 0 } }, active_plan_id: null },
      plans: [{ id: futurePlan.id, payload: futurePlan }], planStamp: '0'.repeat(32), evidence: {},
    },
    headers: { 'access-control-allow-origin': '*' },
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/planning');
  const futureDay = page.locator('details.study-day-foldable[open]').first();
  await expect(futureDay).toBeVisible();
  expect(await futureDay.locator('summary h1, summary h2, summary h3, summary h4').count()).toBe(0);
  const dayHeading = futureDay.locator('.study-day-header > h3');
  await expect(dayHeading).toHaveCount(1);
  expect(await dayHeading.evaluate(el => getComputedStyle(el).display)).not.toBe('none');
  const mobileA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(mobileA11y.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

  await page.getByRole('button', { name: /Search/ }).first().click();
  const searchInput = page.getByRole('combobox', { name: 'Search Fieldbook' });
  await expect(searchInput).toBeVisible();
  expect(await searchInput.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/settings/account');
  await expect(page.getByRole('heading', { level: 2, name: 'Appearance and account' })).toBeVisible();
  const nameInput = page.getByLabel('Display name');
  const restBorder = await nameInput.evaluate(el => getComputedStyle(el).borderTopColor);
  await nameInput.hover();
  const hoverBorder = await nameInput.evaluate(el => getComputedStyle(el).borderTopColor);
  expect(hoverBorder).not.toBe(restBorder);

  const reducedDurations = await page.evaluate(() => ['.shell', '.toast', '.rail-foot'].map(selector => {
    const el = document.querySelector(selector);
    return el ? getComputedStyle(el).transitionDuration : null;
  }));
  expect(reducedDurations).toEqual(['0s', '0s', '0s']);
});

test('follow-up group meanings stay aligned across Card, List, Details, task preview, occurred highlight and retained resources', async ({ page }) => {
  test.setTimeout(120_000);
  // Verify previously published production manifests remain directly loadable.
  for (const url of ['/vocabulary-resources/manifest.3ce90c4c5b58aa11.json', '/vocabulary-resources/manifest.1d6deca143999e5d.json']) {
    const retained = await page.request.get(url);
    expect(retained.status(), url).toBe(200);
  }

  // Desktop: verify Social roles Group 1 ("miss") across Card, List and Word details.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/vocabulary/wordbooks/ielts-vocabulary/groups/ielts-vocabulary-chapter-19-group-01/learn?word=ve-7c6f9881');
  await expect(page.getByRole('heading', { level: 2, name: 'miss', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('To feel sad because someone or something you care about is absent.')).toBeVisible();
  await expect(page.locator('mark.vocabulary-example-target', { hasText: /^miss$/ })).toBeVisible();

  await page.getByRole('button', { name: 'List', exact: true }).click();
  const listItem = page.locator('.vocabulary-learning-list li').filter({ hasText: 'miss' });
  await expect(listItem.getByText('To feel sad because someone or something you care about is absent.')).toBeVisible();
  await listItem.getByRole('button', { name: /Open card/ }).click();
  await page.getByRole('link', { name: /Word details/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'miss' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('To feel sad because someone or something you care about is absent.')).toBeVisible();
  await expect(page.locator('blockquote').filter({ hasText: 'Many students miss their families' }).locator('mark.vocabulary-example-target', { hasText: /^miss$/ })).toBeVisible();

  // Desktop: verify School education Group 6 ("revise") across Card, List and Word details.
  await page.goto('/vocabulary/wordbooks/ielts-vocabulary/groups/ielts-vocabulary-chapter-05-group-06/learn?word=ve-7e95157b');
  await expect(page.getByRole('heading', { level: 2, name: 'revise', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('To review, alter and amend something, especially written work.')).toBeVisible();
  await expect(page.locator('mark.vocabulary-example-target', { hasText: /^revise$/ })).toBeVisible();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('.vocabulary-learning-list li').filter({ hasText: 'revise' }).getByText('To review, alter and amend something, especially written work.')).toBeVisible();

  // Desktop: verify Conflict and competition Group 3 ("occur") highlights "occurred" on Card and in Audio practice mode.
  await page.goto('/vocabulary/wordbooks/ielts-vocabulary/groups/ielts-vocabulary-chapter-18-group-03/learn?word=ve-ad2464d');
  await expect(page.getByRole('heading', { level: 2, name: 'occur', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('mark.vocabulary-example-target', { hasText: /^occurred$/ })).toBeVisible();
  await page.goto('/vocabulary/review?bookId=ielts-vocabulary&unitId=ielts-vocabulary-chapter-18-group-03&entryId=ve-ad2464d&senseId=kaikki%3Af682b333d5e5fcbffe&dueOnly=false&mode=audio');
  await expect(page.getByRole('button', { name: 'Start session' })).toBeEnabled({ timeout: 30000 });
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'occur', exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.practice-audio-example mark.vocabulary-example-target', { hasText: /^occurred$/ })).toBeVisible({ timeout: 15000 });

  // Existing unfinished task with PR #42's noun "range" previews the verb update and can still use original meanings.
  const rangePlan = {
    id: 'range-meaning-upgrade',
    title: 'Actions and behaviour - Group 4',
    skill: 'vocabulary',
    kind: 'vocabulary',
    dateKey: '2026-11-17',
    status: 'pending',
    origin: 'automatic',
    estimatedMinutes: 5,
    target: {
      type: 'vocabulary',
      mode: 'learning-batch',
      bookId: 'ielts-vocabulary',
      unitId: 'ielts-vocabulary-chapter-20-group-04',
      batchIndex: 0,
      batchSize: 10,
      assessmentMode: 'definition',
      cards: [{ entryId: 've-b9a5e1a', senseId: 'kaikki:f95bb821d396bdb939' }],
    },
  };
  await page.route('**/rpc/load_planning_workspace', route => route.fulfill({
    json: {
      profile: { settings: { dailyMinutes: 30, activeSkill: 'vocabulary' }, active_plan_id: rangePlan.id },
      plans: [{ id: rangePlan.id, payload: rangePlan }],
      planStamp: '0'.repeat(32),
      evidence: {},
    },
    headers: { 'access-control-allow-origin': '*' },
  }));
  await page.goto(`/vocabulary/wordbooks/ielts-vocabulary/groups/ielts-vocabulary-chapter-20-group-04/learn?planId=${rangePlan.id}&word=ve-b9a5e1a`);
  const rangeCard = page.getByRole('article', { name: 'Current learning word' });
  await expect(rangeCard.getByRole('heading', { level: 2, name: 'range', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Previewing current group meanings/)).toBeVisible();
  await expect(rangeCard.getByText('To vary or extend within specified limits.')).toBeVisible();
  await page.getByRole('button', { name: 'Use original task meanings' }).click();
  await expect(page.getByText('Using the original task meanings.')).toBeVisible();
  await expect(rangeCard.getByText('Selection, array.')).toBeVisible();

  // Mobile 390px: verify updated group card and Word details render without horizontal overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/vocabulary/wordbooks/ielts-vocabulary/groups/ielts-vocabulary-chapter-18-group-03/learn?word=ve-7c6e2eb5');
  await expect(page.getByRole('heading', { level: 2, name: 'foul', exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Wicked, detestable or extremely unpleasant.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
