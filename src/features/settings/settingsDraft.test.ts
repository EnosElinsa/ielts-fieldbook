// @ts-nocheck
import { expect, test } from 'vitest';
import { emptyState } from '../../domain';
import { ensureUnifiedPlans } from '../../lib/planTemplates';
import { settingsPlanPreview } from './settingsDraft';

test('settings preview matches regeneration without changing the current schedule or protected work',()=>{
  const now=new Date('2026-10-14T12:00:00');const state=emptyState();
  state.settings.days=[1,2,3,4,5,6,7];ensureUnifiedPlans(state,undefined,now);
  const manual=state.plans.find(plan=>plan.dateKey==='2026-10-14');manual.origin='manual';
  const started=state.plans.find(plan=>plan.dateKey==='2026-10-15');started.status='in_progress';started.startedAt=now.toISOString();
  const before=structuredClone(state);
  const changes={dailyMinutes:90,planning:{...state.settings.planning,week:{4:{minutes:60,focus:'listening'},5:{minutes:0}},weights:{writing:3,speaking:1,reading:1,listening:1}}};
  const preview=settingsPlanPreview(state.settings,changes,state.plans,'2026-10-14',state);
  expect(state).toEqual(before);
  const actual=structuredClone(state);actual.settings={...actual.settings,...changes};
  const generated=ensureUnifiedPlans(actual,undefined,now);
  expect(preview.generated).toEqual(generated);
  expect(preview.affected.map(plan=>plan.id)).not.toContain(manual.id);
  expect(preview.affected.map(plan=>plan.id)).not.toContain(started.id);
  expect(actual.plans.find(plan=>plan.id===manual.id)).toEqual(manual);
  expect(actual.plans.find(plan=>plan.id===started.id)).toEqual(started);
});
