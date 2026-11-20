import { test, expect } from './fixture';

const provenance = { sourceUrl:'https://example.test/listening', sourceVersion:'fixture', fetchedAt:'2026-11-17T00:00:00Z', contentHash:'synthetic-map', authorization:'fixture' };
const paper = { id:'map-paper', book:21, test:1, title:'Sample Listening Test', provenance };
const section = { id:'map-section', paperId:paper.id, skill:'listening', part:2, title:'Part 2', status:'ready', questionTypes:['map'], questionCount:2, assetId:'recording', sentences:[], provenance };
const stimulus = '<p>Label the plan below.</p><p><img src="exam-asset:grounds" alt="Park plan"></p>';
const questions = [11,12].map(number => ({
  id:`site-${number}`, sectionId:section.id, paperId:paper.id, skill:'listening', type:'map', number,
  groupId:'map-questions', prompt:`Landmark ${number}`, options:['A','B'], answer:'B', stimulusHtml:stimulus, provenance,
}));
const assets = [
  { id:'recording', sectionId:section.id, paperId:paper.id, kind:'audio', storagePath:'fixture/recording.mp3', duration:80, provenance },
  { id:'grounds', sectionId:section.id, paperId:paper.id, kind:'image', storagePath:'fixture/grounds.png', provenance },
];
const tables: Record<string, {id:string}[]> = { exam_papers:[paper], exam_sections:[section], exam_questions:questions, exam_assets:assets };
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/2sQAAAAASUVORK5CYII=', 'base64');

test('listening keeps the diagram visible beside the exercise and in the reference dialog', async ({page}) => {
  let imageUnavailable = true;
  let refreshedImageRequested = false;
  await page.route('**/rest/v1/exam_*', route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)!;
    return route.fulfill({json:(tables[name] || []).map(payload => ({id:payload.id,payload})), headers:{'access-control-allow-origin':'*'}});
  });
  await page.route('**/exam-assets/fixture/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('grounds.png')) {
      if (imageUnavailable) return route.fulfill({status:503});
      refreshedImageRequested ||= url.searchParams.has('assetRetry');
      return route.fulfill({contentType:'image/png', body:pixel});
    }
    return route.fulfill({status:204});
  });
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/listening/map-section');
  await expect(page.getByRole('alert').filter({hasText:'The source image could not load'})).toBeVisible();
  imageUnavailable = false;
  await page.getByRole('button', {name:'Retry image'}).click();
  const image = page.getByRole('img', {name:'Park plan'});
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  expect(refreshedImageRequested).toBe(true);
  await expect(page.getByRole('button', {name:'Method notes'})).toHaveAttribute('aria-pressed','false');
  const exercise = await page.getByRole('region', {name:'Questions and answers'}).boundingBox();
  const recording = await page.locator('.exam-practice-recording').boundingBox();
  expect(exercise?.width).toBe(recording?.width);
  await page.setViewportSize({width:390,height:844});
  const answer = page.getByRole('combobox', {name:'Answer 11'});
  await answer.click();
  await page.getByRole('option', {name:'B'}).click();
  await page.getByRole('button', {name:'View map for question 11'}).click();
  const dialog = page.getByRole('dialog', {name:'Map reference'});
  await expect(dialog.getByRole('img', {name:'Park plan'})).toBeVisible();
  const mapAnswer = dialog.getByRole('combobox', {name:'Answer 11'});
  await expect(mapAnswer).toHaveText('B');
  await mapAnswer.press('Enter');
  await page.getByRole('option', {name:'A',exact:true}).click();
  await page.keyboard.press('Escape');
  await expect(answer).toHaveText('A');
  await expect(page.getByRole('button', {name:'View map for question 11'})).toBeFocused();
  await page.reload();
  await expect(answer).toHaveText('A');
  await page.getByRole('button', {name:'Resume',exact:true}).click();
  await page.getByRole('link', {name:/Go to question 12/}).click();
  await expect(page.getByRole('combobox', {name:'Answer 12'})).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
