import { readFileSync } from 'node:fs';
import { registerVocabularyTeaching } from '../src/domain/vocabulary/runtimeData';

// Browser APIs used by the shared Radix select are absent in jsdom.
HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.setPointerCapture ??= () => {};
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};

const data = (name: string) => JSON.parse(readFileSync(`src/domain/vocabulary/${name}.json`, 'utf8'));
registerVocabularyTeaching({
  senseBaselines: {},
  curriculum: { common: data('groupCurriculumCommon'), topics: [...data('groupCurriculumTopicsA'), ...data('groupCurriculumTopicsB'), ...data('groupCurriculumTopicsC')], source: data('groupCurriculumSource'), repairs: data('groupCurriculumRepairs'), modern: data('groupCurriculumModernDefaults') },
  readiness: { core: [...data('readinessContent0'), ...data('readinessContent1'), ...data('readinessContent2')], corrections: data('readinessCorrections'), defaults: data('readinessDefaults') },
  learning: data('learningSenseOverlay'), tasks: data('taskSenseBindings'), context: data('contextSenseOverlay'),
});
