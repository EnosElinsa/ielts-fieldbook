import type { StudySkill } from '../domain/plans';
export type PracticeOption = { value: string; label: string; minimum: number };
export const TASK_PRACTICES: Record<StudySkill, PracticeOption[]> = {
  writing: [{value:'recommended',label:'Recommended practice',minimum:1},{value:'overview',label:'Task 1 · Overview',minimum:5},{value:'compare',label:'Task 1 · Compare',minimum:5},{value:'outline',label:'Task 2 · Outline',minimum:5},{value:'body',label:'Task 2 · Body paragraph',minimum:10},{value:'task1-timed',label:'Task 1 · Timed response',minimum:20},{value:'task2-timed',label:'Task 2 · Timed response',minimum:40},{value:'writing-mock',label:'Writing mock',minimum:60}],
  speaking: [{value:'recommended',label:'Recommended practice',minimum:1},...['1','2','3'].map(part=>({value:`speaking-p${part}`,label:`Part ${part} · Speaking`,minimum:5})),{value:'speaking-mock',label:'Speaking mock',minimum:15}],
  reading: [{value:'recommended',label:'Recommended practice',minimum:2},{value:'reading-practice',label:'Passage practice',minimum:2}],
  listening: [{value:'recommended',label:'Recommended practice',minimum:1},{value:'listening-practice',label:'Listening part practice',minimum:1},{value:'listening-intensive',label:'Sentence intensive practice',minimum:5}],
  vocabulary: [{value:'learning-batch',label:'Learn and assess a batch',minimum:5},{value:'due-review',label:'Recall due words',minimum:1}],
};
