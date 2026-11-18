import { expect, test } from 'vitest';
import { studyReturnDelta, studySourceUrl } from './studyNavigation';

test('Planning source captures its view and preserves filters, date and task anchor',()=>{
  expect(studySourceUrl({pathname:'/planning',search:'?date=2026-11-24',hash:''},'#task-one')).toBe('/planning?date=2026-11-24&view=schedule#task-one');
  for(const view of ['schedule','waiting','history','task'])expect(studySourceUrl({pathname:'/planning',search:`?view=${view}&date=2026-11-24`,hash:'#task-one'})).toBe(`/planning?view=${view}&date=2026-11-24#task-one`);
  expect(studySourceUrl({pathname:'/today',search:'?view=overdue',hash:'#task-one'})).toBe('/today?view=overdue#task-one');
});

test('return pops only a proven earlier entry owned by the same account',()=>{
  const origin={owner:'one',url:'/planning?view=schedule#task-one',sourceUrl:'/planning?view=schedule#task-one',index:2};
  expect(studyReturnDelta(origin,origin.url,'one',5,false)).toBe(-3);
  for(const [row,to,owner,index,restored] of [
    [origin,origin.url,'two',5,false],
    [origin,origin.url,'one',5,true],
    [origin,'/planning?view=history','one',5,false],
    [{...origin,sourceUrl:'/today'},origin.url,'one',5,false],
    [origin,origin.url,'one',2,false],
    [origin,origin.url,'one',1,false],
    [origin,origin.url,'one',undefined,false],
    [{...origin,index:-1},origin.url,'one',5,false],
    [{...origin,index:undefined},origin.url,'one',5,false],
  ] as const)expect(studyReturnDelta(row,to,owner,index,restored)).toBeUndefined();
});
