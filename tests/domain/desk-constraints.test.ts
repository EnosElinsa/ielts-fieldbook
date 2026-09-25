import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  composeEssay,
  writingSaveBlockers,
  writingWordSoftConfirm,
  fragmentFieldsFilled,
  normalizeSections,
} from '../../src/domain/desk';
import { normalizeDraft } from '../../src/domain/state';

test('composeEssay stitches overview columns', () => {
  assert.equal(
    composeEssay('overview', { intro: 'The chart shows X.', overview: 'Overall, Y rose.' }, 'ignored'),
    'The chart shows X.\n\nOverall, Y rose.',
  );
});

test('composeEssay stitches outline columns', () => {
  assert.equal(
    composeEssay(
      'outline',
      { position: 'I agree.', pointA: 'First, schools matter.', pointB: 'Second, homes matter.' },
      '',
    ),
    'I agree.\n\nFirst, schools matter.\n\nSecond, homes matter.',
  );
});

test('composeEssay uses paragraph for compare/body and free text for timed/full', () => {
  assert.equal(composeEssay('compare', { paragraph: 'One body paragraph.' }, 'free'), 'One body paragraph.');
  assert.equal(composeEssay('body', { paragraph: 'Developed point.' }, ''), 'Developed point.');
  assert.equal(composeEssay('timed', { paragraph: 'ignored' }, 'Full timed essay.'), 'Full timed essay.');
  assert.equal(composeEssay('full', {}, 'Whole answer.'), 'Whole answer.');
});

test('normalizeDraft keeps optional sections and leaves string drafts alone', () => {
  assert.deepEqual(normalizeDraft('hello'), {
    text: 'hello',
    transcript: '',
    notes: '',
    parentSessionId: null,
  });
  const withSections = normalizeDraft({
    text: '',
    sections: { intro: 'In.', overview: 'Ov.', extra: 'drop' },
  });
  assert.equal(withSections.sections.intro, 'In.');
  assert.equal(withSections.sections.overview, 'Ov.');
  assert.equal(withSections.sections.position, '');
  assert.equal(withSections.sections.extra, undefined);
});

test('overview and outline block when a column is empty or over 120 words', () => {
  assert.deepEqual(
    writingSaveBlockers('overview', '1', '', {}, { intro: 'Only intro.' }),
    ['Fill both the introduction and the overview.'],
  );
  const long = Array.from({ length: 121 }, () => 'word').join(' ');
  assert.deepEqual(
    writingSaveBlockers('overview', '1', long, {}, { intro: long.slice(0, 50), overview: long }),
    ['Overview practice stays under 120 words.'],
  );
  assert.deepEqual(
    writingSaveBlockers('outline', '2', '', {}, { position: 'Yes.', pointA: 'A.' }),
    ['Fill your position and both points.'],
  );
  assert.equal(
    writingSaveBlockers(
      'outline',
      '2',
      composeEssay('outline', { position: 'Yes.', pointA: 'Point one.', pointB: 'Point two.' }, ''),
      {},
      { position: 'Yes.', pointA: 'Point one.', pointB: 'Point two.' },
    ).length,
    0,
  );
});

test('compare and body enforce 40–180 words', () => {
  assert.deepEqual(
    writingSaveBlockers('compare', '1', 'too short', {}, { paragraph: 'too short' }),
    ['Write at least 40 words for this paragraph.'],
  );
  const forty = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
  assert.equal(writingSaveBlockers('body', '2', forty, {}, { paragraph: forty }).length, 0);
  const long = Array.from({ length: 181 }, (_, i) => `w${i}`).join(' ');
  assert.deepEqual(
    writingSaveBlockers('compare', '1', long, {}, { paragraph: long }),
    ['This paragraph practice stays under 180 words.'],
  );
});

test('timed and full require the checklist; short essays are soft-confirm only', () => {
  const essay = Array.from({ length: 160 }, (_, i) => `w${i}`).join(' ');
  assert.deepEqual(
    writingSaveBlockers('timed', '1', essay, { series: true, units: true, time: true }),
    ['Tick series, units, time, and overview before saving.'],
  );
  assert.equal(
    writingSaveBlockers('timed', '1', essay, {
      series: true,
      units: true,
      time: true,
      overview: true,
    }).length,
    0,
  );
  assert.deepEqual(
    writingSaveBlockers('full', '2', essay, { prompt: true, position: true }),
    ['Tick the question, position, and two-paragraph checks before saving.'],
  );
  assert.match(writingWordSoftConfirm('timed', '1', 'short draft') || '', /under 150/);
  assert.match(writingWordSoftConfirm('full', '2', essay) || '', /under 250/);
  assert.equal(writingWordSoftConfirm('timed', '1', essay), null);
  assert.equal(writingWordSoftConfirm('overview', '1', 'short'), null);
});

test('speak-blind does not apply writing save blockers', () => {
  assert.deepEqual(writingSaveBlockers('speak-blind', '2', '', {}), []);
  assert.equal(fragmentFieldsFilled('overview', { intro: 'a', overview: 'b' }), true);
  assert.equal(fragmentFieldsFilled('overview', { intro: 'a' }), false);
  assert.deepEqual(normalizeSections(null).intro, '');
});
