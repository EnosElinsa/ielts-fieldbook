import common from './groupCurriculumCommon.json';
import topicsA from './groupCurriculumTopicsA.json';
import topicsB from './groupCurriculumTopicsB.json';
import topicsC from './groupCurriculumTopicsC.json';
import source from './groupCurriculumSource.json';
import repairs from './groupCurriculumRepairs.json';
import modern from './groupCurriculumModernDefaults.json';
import { VOCABULARY_CATALOG } from './catalog';
import type { VocabularyEntry, VocabularySense } from './types';

export type VocabularyCurriculum = {
  basis: 'theme' | 'common' | 'multiple' | 'source';
  title: string;
  explanation: string;
  senses: VocabularySense[];
};
export type CurriculumRow = {bookId?:string;unitId?:string;entryId:string;term:string;sense:VocabularySense;originalSense?:VocabularySense;reason:string;sectionId?:string;sentenceIds?:string[]};
const key = (bookId: string, unitId: string, entryId: string) => JSON.stringify([bookId,unitId,entryId]);
const topics = new Map(([...topicsA,...topicsB,...topicsC] as CurriculumRow[]).map(row=>[key(row.bookId!,row.unitId!,row.entryId),row]));
const sources = new Map((source as CurriculumRow[]).map(row=>[key(row.bookId!,row.unitId!,row.entryId),row]));
const repairRows=new Map((repairs as CurriculumRow[]).map(row=>[JSON.stringify([row.entryId,row.sense.id]),row]));
const modernRows=new Map((modern as CurriculumRow[]).map(row=>[row.entryId,row]));
const commonRows = new Map<string,CurriculumRow[]>();
for (const row of common as CurriculumRow[]) {
  const rows=commonRows.get(row.entryId)||[];
  if(!rows.some(item=>item.sense.id===row.sense.id)) rows.push(row);
  commonRows.set(row.entryId,rows);
}
const baselines = new Map<string,VocabularySense[]>();
for (const row of [...topics.values(),...sources.values(),...repairRows.values(),...modernRows.values(),...(common as CurriculumRow[])]) {
  const id=JSON.stringify([row.entryId,row.sense.id]);
  baselines.set(id,[...(baselines.get(id)||[]),row.sense,...(row.originalSense?.id===row.sense.id?[row.originalSense]:[])]);
}
const unitIndexes=new WeakMap<object,Map<string,typeof VOCABULARY_CATALOG.units[number]>>();
const membershipIndexes=new WeakMap<object,Set<string>>();

/** A teaching syllabus is distinct from a claim about the original source author. */
export function vocabularyCurriculum(entry:VocabularyEntry, request:{bookId?:string;unitId?:string}, fallback:VocabularySense|undefined): {curriculum:VocabularyCurriculum;rows:CurriculumRow[]}|undefined {
  const {bookId,unitId}=request;
  if(!bookId||!unitId||!fallback) return;
  let units=unitIndexes.get(VOCABULARY_CATALOG.units);
  if(!units){units=new Map(VOCABULARY_CATALOG.units.map(row=>[JSON.stringify([row.bookId,row.id]),row]));unitIndexes.set(VOCABULARY_CATALOG.units,units);}
  let memberships=membershipIndexes.get(VOCABULARY_CATALOG.memberships);
  if(!memberships){memberships=new Set(VOCABULARY_CATALOG.memberships.map(row=>key(row.bookId,row.unitId,row.entryId)));membershipIndexes.set(VOCABULARY_CATALOG.memberships,memberships);}
  const unit=units.get(JSON.stringify([bookId,unitId]));
  if(!unit||unit.kind==='chapter'||!memberships.has(key(bookId,unitId,entry.id))) return;
  const chapter=units.get(JSON.stringify([bookId,unit.parentId]));
  const sourceRow=sources.get(key(bookId,unitId,entry.id)),topicRow=topics.get(key(bookId,unitId,entry.id));
  const commonChoices=commonRows.get(entry.id)||[];
  const multiple=bookId==='guixue:10177'&&unit.parentId==='21954';
  const theme=bookId==='guixue:10174';
  const repair=repairRows.get(JSON.stringify([entry.id,fallback.id]));
  const modernRow=modernRows.get(entry.id);
  const rows=sourceRow?[sourceRow]:topicRow?[topicRow]:!theme?multiple&&commonChoices.length?commonChoices:modernRow?[modernRow]:commonChoices.length?commonChoices:repair?[repair]:[]:[];
  const basis=sourceRow?'source':multiple?'multiple':theme?'theme':'common';
  const senses=rows.length?(multiple?rows.map(row=>row.sense):[rows[0].sense]):[fallback];
  const explanation=basis==='source'?'Selected after checking the word in the corresponding listening transcript. Examples on this page are learning examples.':basis==='theme'?`Learn this meaning in the ${chapter?.title||unit.title} theme. The selection is a teaching recommendation based on the topic and vocabulary, rather than a quotation from the source wordbook.`:basis==='multiple'?senses.length>1?'Learn these different everyday meanings separately. Each meaning has its own progress and review schedule.':'This word has one common modern learning meaning. The chapter title does not imply that every word needs an invented second meaning.':'Learn a common modern meaning first. This word list does not prescribe a single contextual meaning; other dictionary meanings remain available.';
  return {curriculum:{basis,title:[chapter?.title,unit.title].filter(Boolean).join(' · '),explanation,senses},rows};
}

export function vocabularyCurriculumBaselines(entryId:string,senseId:string):VocabularySense[] {
  return baselines.get(JSON.stringify([entryId,senseId])) || [];
}
