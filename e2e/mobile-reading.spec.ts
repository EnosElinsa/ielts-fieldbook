import { test, expect } from './fixture';

const provenance = { sourceUrl: 'https://example.test/reading', sourceVersion: 'fixture', fetchedAt: '2026-11-17T00:00:00Z', contentHash: 'synthetic-reading', authorization: 'public fixture' };
const paper = { id: 'audit-paper', book: 21, test: 1, title: 'Cambridge IELTS 21 · Test 1', provenance };
const section = (part: number, status: 'ready' | 'incomplete') => ({
  id: 'audit-reading-' + part, paperId: paper.id, skill: 'reading', part,
  title: 'Passage ' + part, questionTypes: ['gap'], questionCount: 6, status, sentences: [], provenance,
});
const sections = [section(1, 'ready'), section(2, 'ready'), section(3, 'incomplete')];
const attempt = {
  id: 'audit-reading-attempt', skill: 'reading', sourceId: sections[0].id, sectionIds: [sections[0].id],
  mode: 'practice', status: 'paused', responses: {}, evidence: {}, keywords: {}, errorReasons: {},
  startedAt: '2026-11-17T17:00:00Z', updatedAt: '2026-11-17T17:10:00Z', elapsedSeconds: 140, hintsEnabled: false,
};
const passage = {
  id: 'audit-wetlands', sectionId: sections[0].id, title: 'Restoring city wetlands', provenance,
  paragraphs: Array.from({ length: 8 }, (_, index) => ({
    id: String.fromCharCode(65 + index),
    text: 'Restored wetlands can store floodwater in the hours after a storm. In some cities, engineers have lowered small sections of parkland to let water collect before it reaches roads and houses. The land dries slowly and can be used as a public open space during the rest of the year. The plants in these parks also create habitat for birds and insects.',
  })),
};
const questions = Array.from({ length: 6 }, (_, index) => ({
  id: 'audit-reading-question-' + (index + 1), sectionId: sections[0].id, paperId: paper.id,
  number: index + 1, skill: 'reading', type: 'gap',
  prompt: 'Wetlands can collect water before it reaches roads and _____.', answer: 'houses', maxWords: 1, provenance,
}));
const tables: Record<string, { id: string }[]> = {
  exam_papers: [paper], exam_sections: sections, exam_passages: [passage],
  exam_questions: questions, exam_attempts: [attempt], exam_assets: [],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/exam_*', async route => {
    const url = new URL(route.request().url());
    const rows = (tables[url.pathname.split('/').at(-1)!] || []).filter(row => {
      const ids = url.searchParams.get('id');
      return !ids?.startsWith('in.(') || ids.slice(4, -1).split(',').includes(row.id);
    });
    await route.fulfill({ json: rows.map(payload => ({ id: payload.id, payload })), headers: { 'access-control-allow-origin': '*' } });
  });
});

test('narrow reading bank keeps resumable, ready, and unavailable passages readable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/reading');
  const rows = page.locator('.exam-part-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).getByRole('link', { name: 'Resume session' })).toBeVisible();
  await expect(rows.nth(1).getByRole('link', { name: 'Practise passage 2' })).toBeVisible();
  await expect(rows.nth(2).getByText(/Source incomplete/)).toBeVisible();
  for (const title of await rows.getByRole('heading').all()) {
    const bounds = await title.boundingBox();
    expect(bounds?.height).toBeLessThanOrEqual(32);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('mobile reading keeps the panel switch reachable and restores each panel position', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/reading/audit-reading-1?attempt=' + attempt.id);
  const panels = page.getByRole('group', { name: 'Practice panels' });
  const passageSwitch = panels.getByRole('button', { name: 'Passage' });
  const questionsSwitch = panels.getByRole('button', { name: 'Questions & answers' });
  const paragraph = page.locator('#exam-panel-source .exam-passage p').nth(3);
  const y = (target: typeof paragraph) => target.evaluate(element => element.getBoundingClientRect().top);
  await expect(passageSwitch).toHaveAttribute('aria-pressed', 'true');
  await paragraph.scrollIntoViewIfNeeded();
  const passageY = await y(paragraph);
  expect(await y(panels)).toBeGreaterThanOrEqual(0);
  await expect(questionsSwitch).toBeInViewport();
  await questionsSwitch.click();
  await expect(questionsSwitch).toHaveAttribute('aria-pressed', 'true');
  const question = page.locator('#exam-panel-questions .exam-question').last();
  await question.scrollIntoViewIfNeeded();
  const questionY = await y(question);
  await expect(passageSwitch).toBeInViewport();
  await passageSwitch.click();
  await expect.poll(async () => Math.abs(await y(paragraph) - passageY)).toBeLessThan(20);
  await questionsSwitch.click();
  await expect.poll(async () => Math.abs(await y(question) - questionY)).toBeLessThan(20);
  await expect(page.getByRole('button', { name: 'Save & exit' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
