import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixture';

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
