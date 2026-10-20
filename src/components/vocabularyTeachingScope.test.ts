import {expect,test} from 'vitest';
import {vocabularyTeachingScope} from './vocabularyTeachingScope';

test('word details prepare the exact route identity, including an encoded personal identity',()=>{
  expect(vocabularyTeachingScope('/vocabulary/entry/ve-example','')).toEqual(['ve-example']);
  expect(vocabularyTeachingScope('/vocabulary/entry/personal%3Aexample','?returnTo=%2Fvocabulary%2Fwords')).toEqual(['personal:example']);
});

test('an ordinary single-word review uses its explicit entry',()=>{
  expect(vocabularyTeachingScope('/vocabulary/review','?entryId=ve-example&senseId=sense-1&mode=cloze')).toEqual(['ve-example']);
});

test.each([
  ['/vocabulary/words',''],['/vocabulary',''],['/vocabulary/review','?mode=definition&dueOnly=false'],
  ['/vocabulary/review','?entryId=ve-example&scheduledOnly=true'],
  ['/vocabulary/review','?entryId=ve-example&batchCards=%5B%5D'],
  ['/vocabulary/review','?entryId=ve-example&batch=1'],
  ['/vocabulary/review','?entryId=ve-example&planId=plan'],
  ['/vocabulary/review','?entryId=ve-example&resume=true'],
  ['/vocabulary/study','?entryId=ve-example'],
  ['/vocabulary/history/session-1','?entryId=ve-example'],
  ['/progress','?entryId=ve-example'],
])('aggregate or historical %s keeps complete account teaching', (path,search)=>{
  expect(vocabularyTeachingScope(path,search)).toBeUndefined();
});

test.each(['','?mode=definition','?scheduledOnly=true','?dueOnly=false&wrongOnly=true'])('scheduled and mistake setup defer teaching selection to current-mode evidence: %s',search=>{
  expect(vocabularyTeachingScope('/vocabulary/review',search)).toEqual([]);
});

test.each([
  ['/vocabulary/entry/%E0%A4%A',''],['/vocabulary/entry/a%2Fb',''],
  ['/vocabulary/review','?entryId=a&entryId=b'],['/vocabulary/review','?entryId='],
  ['/vocabulary/review','?entryId=%E0%A4%A'],['/vocabulary/review','?entryId=a%2Fb'],
  ['/vocabulary/entry/a%5Cb',''],['/vocabulary/entry/%00',''],
])('malformed or ambiguous identity %s %s cannot narrow readiness', (path,search)=>{
  expect(vocabularyTeachingScope(path,search)).toBeUndefined();
});
