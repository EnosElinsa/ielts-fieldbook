// @ts-nocheck
import Papa from 'papaparse';
import { addVocabularyItem, recordVocabularyEvidence, normalizeAnswer } from './index';
import { VOCABULARY_CATALOG } from './catalog';

const text = (value) => value == null ? '' : String(value).trim();
const flag = (value) => value === true || value === 1 || value === '1' || value === 'true';
const sourceDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(value) ? `${value.replace(' ','T')}+08:00` : value;
const meaningfulDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T| )\d{2}:\d{2}/.test(value) && Number.isFinite(Date.parse(sourceDate(value))) && Date.parse(sourceDate(value)) > 946684800000;
const sourceKey = (accountId,record) => JSON.stringify([record.provider || 'guixue',accountId,record.sourceBookId,record.unitId,record.sourceWordId || normalizeAnswer(record.term)]);
const hash = (value) => { let h=2166136261; for (const c of value) h=Math.imul(h^c.charCodeAt(0),16777619); return (h>>>0).toString(36); };
const arrays = ['vocabulary','vocabularyStates','vocabularyEvidence','vocabularyReviews','vocabularyActivities','wordbookProgress','wordbookEnrollments','vocabularyImportBatches'];
const englishText = (value) => /[\u3400-\u9fff]/.test(text(value)) ? '' : text(value);
function safeBook(book) {
 const sourceBookId=text(book.sourceBookId ?? book.id);
 const known=VOCABULARY_CATALOG.books.find(item=>item.sourceBookId===sourceBookId);
 return {sourceBookId,title:known?.title || englishText(book.title) || `Imported book ${sourceBookId}`,totalSourceWords:Number(book.totalSourceWords || 0),importedEntryCount:Number(book.importedEntryCount || 0),coverage:['complete','partial','pending'].includes(book.coverage)?book.coverage:'pending',
  units:(Array.isArray(book.units)?book.units:[]).map((unit,index)=>({id:text(unit.id),parentId:unit.parentId==null?null:text(unit.parentId),title:englishText(unit.title) || `Group ${index+1}`,order:Number(unit.order || index),level:Number(unit.level || 1),totalSourceWords:unit.totalSourceWords==null?null:Number(unit.totalSourceWords),record:unit.record && typeof unit.record==='object'?JSON.parse(JSON.stringify(unit.record),(key,value)=>/token|cookie|authorization|password/i.test(key)?undefined:typeof value==='string'?englishText(value):value):null})),
  unitCoverage:(Array.isArray(book.unitCoverage)?book.unitCoverage:[]).map(unit=>({unitId:text(unit.unitId),expected:Number(unit.expected || 0),imported:Number(unit.imported || 0),complete:unit.complete===true})),
  reports:book.reports && typeof book.reports==='object'?JSON.parse(JSON.stringify(book.reports),(key,value)=>/token|cookie|authorization|password/i.test(key)?undefined:typeof value==='string'?englishText(value):value):null};
}

function normalizeRecord(raw, index, provider) {
 const term=text(raw.term ?? raw.word ?? raw.en_word ?? raw.eng_word ?? raw.english);
 const repaired=flag(raw.is_fix ?? raw.repaired);
 const lastCorrect=raw.last_correct ?? raw.lastCorrect;
 const wrongCount=Number(raw.wrong_num ?? raw.wrongCount ?? 0);
 const history=Array.isArray(raw.history) ? raw.history.map(item => ({id:text(item.id),hierarchyRecordId:text(item.hierarchyRecordId),sourceLabel:englishText(item.sourceLabel),date:item.date ?? item.occurredAt ?? item.create_time,response:englishText(item.response ?? item.user_input),correct:item.correct === true || item.correct === false ? item.correct : item.is_correct === '1' || item.is_correct === 1 ? true : item.is_correct === '2' || item.is_correct === 2 ? false : null})) : [];
 return {sourceBookId:text(raw.sourceBookId ?? raw.book_id),unitId:text(raw.unitId ?? raw.book_hierarchy_id),sourceWordId:text(raw.sourceWordId ?? raw.word_id ?? raw.id),term,
  meaning:englishText(raw.meaning ?? raw.definition),example:englishText(raw.example),wrongCount,lastCorrect: lastCorrect == null ? null : text(lastCorrect),repaired,currentlyWrong:(text(lastCorrect)==='2' || lastCorrect===false) && !repaired,
  pronunciation:provider==='dictionary' ? (Array.isArray(raw.pronunciation) ? {ipa:englishText(raw.pronunciation[0]?.ipa)} : raw.pronunciation) : undefined,
  senses:provider==='dictionary' && Array.isArray(raw.senses)?raw.senses.map((sense,number)=>({id:englishText(sense.id) || `dictionary:${number}`,definition:englishText(sense.definition),example:englishText(sense.example),pos:englishText(sense.pos) || 'expression',source:englishText(sense.source),license:englishText(sense.license),attribution:englishText(sense.attribution),sourceUrl:englishText(sense.sourceUrl),usage:englishText(sense.usage),distinctions:(sense.distinctions || []).map(englishText).filter(Boolean),collocations:(sense.collocations || []).map(englishText).filter(Boolean),synonyms:(sense.synonyms || []).map(englishText).filter(Boolean),antonyms:(sense.antonyms || []).map(englishText).filter(Boolean)})).filter(sense=>sense.definition):[],
  avgRate: raw.avgRate ?? raw.avg_rate ?? null,history,index,provider};
}

export function parseVocabularyImport(input, format = 'auto') {
 if (typeof input !== 'string' && (!input || typeof input !== 'object')) throw new Error('Import must be JSON or CSV.');
 const json = typeof input === 'object' || format === 'json' || format === 'guixue' || (format==='auto' && /^[\s\ufeff]*[\[{]/.test(input));
 if (json) {
  const snapshot=typeof input === 'string' ? JSON.parse(input.replace(/^\ufeff/,'')) : input;
  if (snapshot.provider==='dictionary') {
   if (snapshot.schemaVersion!==1 || !Array.isArray(snapshot.entries)) throw new Error('Unsupported dictionary enrichment version.');
   const records=snapshot.entries.map((row,index)=>normalizeRecord({...row,meaning:row.senses?.[0]?.definition,example:row.senses?.[0]?.example},index,'dictionary'));
   if (records.some(record=>!record.senses.length || record.senses.some(sense=>sense.license!=='CC-BY-SA-4.0' || !sense.source))) throw new Error('Dictionary enrichment needs licensed, attributed English senses.');
   return {schemaVersion:1,provider:'dictionary',accountId:'public-dictionary',books:[],records};
  }
  if (snapshot.provider!=='guixue') throw new Error('Unsupported import provider.');
  if (snapshot.schemaVersion!==1) throw new Error('Unsupported snapshot version.');
  if (!text(snapshot.accountId)) throw new Error('Guixue account identity is required.');
  if (!Array.isArray(snapshot.records)) throw new Error('Snapshot records must be an array.');
  return {schemaVersion:1,provider:'guixue',accountId:text(snapshot.accountId),exportedAt:meaningfulDate(snapshot.exportedAt)?new Date(sourceDate(snapshot.exportedAt)).toISOString():null,books:Array.isArray(snapshot.books)?snapshot.books.map(safeBook):[],records:snapshot.records.map((row,index)=>normalizeRecord(row,index,'guixue'))};
 }
 const parsed=Papa.parse(input.replace(/^\ufeff/,''), {header:true,skipEmptyLines:'greedy',transformHeader:value=>value.trim()});
 if (parsed.errors.length) throw new Error(`Invalid CSV: ${parsed.errors[0].message}`);
 if (!parsed.meta.fields?.some(field=>['term','word','en_word','eng_word','english'].includes(field))) throw new Error('CSV needs a term column.');
 return {schemaVersion:1,provider:'csv',accountId:'local',books:[],records:parsed.data.map((row,index)=>normalizeRecord(row,index,'csv'))};
}

function validate(batch) {
 if (!batch || !Array.isArray(batch.records) || !['csv','guixue','dictionary'].includes(batch.provider) || !text(batch.accountId)) throw new Error('Invalid import batch.');
 const invalid=batch.records.filter(row => !row.term || /[\u3400-\u9fff]/.test(row.term) || !Number.isFinite(row.wrongCount) || row.wrongCount<0 || (batch.provider==='guixue' && (!row.sourceBookId || !row.unitId || !row.sourceWordId)));
 return invalid;
}

const eventKey = (accountId,record,event) => `${record.provider || 'guixue'}-event:${encodeURIComponent(sourceKey(accountId,record))}:${encodeURIComponent(event.id || JSON.stringify([event.date,event.response,event.correct]))}`;
const completeHistory = (row) => row.history.filter(event=>meaningfulDate(event.date) && typeof event.correct==='boolean');
const recordFingerprint = (batch,record) => JSON.stringify([sourceKey(batch.accountId,record),record.term,record.meaning,record.example,record.wrongCount,record.lastCorrect,record.repaired,record.avgRate,record.history,record.senses]);
const fingerprints = (batch) => batch.records.map(record => recordFingerprint(batch,record)).sort();

export function previewVocabularyImport(state, batch) {
 const invalid=validate(batch);
 const known=new Set((state.vocabulary || []).map(item=>normalizeAnswer(item.term)));
 const sourceRecords=new Set((state.vocabularyImportBatches || []).flatMap(item=>item.fingerprints || []));
 let matched=0,imported=0,duplicated=0,missingEnrichment=0,manualReviewRequired=0;
 const seen=new Set();
 batch.records.forEach(record => {
  const key=sourceKey(batch.accountId,record);
  const fingerprint=recordFingerprint(batch,record);
  if (sourceRecords.has(fingerprint) || seen.has(fingerprint)) duplicated++; else imported++;
  seen.add(fingerprint);
  if (known.has(normalizeAnswer(record.term))) matched++;
  const catalogue=VOCABULARY_CATALOG.entries.find(item=>normalizeAnswer(item.term)===normalizeAnswer(record.term));
  if (!record.meaning && !catalogue) missingEnrichment++;
  if ((record.history.length>completeHistory(record).length) || (record.wrongCount>0 && !completeHistory(record).length)) manualReviewRequired++;
 });
 const warnings=(batch.books || []).filter(book=>book.coverage!=='complete').map(book=>`${book.title}: source coverage is ${book.coverage || 'pending'} (${book.importedEntryCount || 0}/${book.totalSourceWords || 0} entries).`);
 return {matched,imported,duplicated,missingEnrichment,manualReviewRequired,invalid:invalid.length,warnings};
}

export function mergeVocabularyImport(state, batch) {
 const report=previewVocabularyImport(state,batch);
 if (report.invalid) throw new Error(`Invalid import: ${report.invalid} records need correction.`);
 const batchPrints=fingerprints(batch);
 const batchId=`vocabulary-import:${batch.provider}:${hash(JSON.stringify([batch.accountId,batchPrints]))}`;
 if ((state.vocabularyImportBatches || []).some(item=>item.id===batchId && JSON.stringify(item.fingerprints)===JSON.stringify(batchPrints))) return {...report,imported:0,duplicated:batch.records.length};
 // All validation happens before the working copy is changed or committed.
 const next=structuredClone(state);
 arrays.forEach(key => { if (!Array.isArray(next[key])) next[key]=[]; });
 const summaries=[];
 for (const record of batch.records) {
  const key=sourceKey(batch.accountId,record);
  const catalogue=VOCABULARY_CATALOG.entries.find(item=>normalizeAnswer(item.term)===normalizeAnswer(record.term));
  const sourceType=batch.provider==='guixue'?'wordbook':'personal';
  const bookId=batch.provider==='guixue'?`guixue:${record.sourceBookId}`:undefined;
  const skill=record.sourceBookId==='10176'?'reading':record.sourceBookId==='10174'?'writing':'listening';
  const {item,invalid,reason}=addVocabularyItem(next,{...(catalogue || {}),...(record.senses.length?{senses:record.senses}:{}),term:record.term,pronunciation:record.pronunciation,category:record.term.includes(' ')?'phrase':'word',meaning:record.meaning || catalogue?.meaning || '',example:record.example || catalogue?.example || '',enrichmentPending:!record.meaning&&!catalogue,sources:[{type:sourceType,id:key,skill:batch.provider==='guixue'?skill:undefined,senseId:record.senses[0]?.id || catalogue?.senses[0]?.id,bookId,unitId:record.unitId || undefined,context:`${batch.provider} account ${batch.accountId}; source word ${record.sourceWordId}`} ]});
  if (invalid || !item) throw new Error(`Invalid import item: ${reason || record.term}`);
  const senseId=item.senses[0]?.id;
  const membership=item.sources.find(source=>source.id===key);
  if (membership) membership.senseId=senseId;
  summaries.push({sourceKey:key,entryId:item.id,sourceWordId:record.sourceWordId,sourceBookId:record.sourceBookId,unitId:record.unitId,wrongCount:record.wrongCount,lastCorrect:record.lastCorrect,repaired:record.repaired,currentlyWrong:record.currentlyWrong,avgRate:record.avgRate,undatedHistory:record.history.filter(event=>!completeHistory(record).includes(event))});
  for (const event of completeHistory(record)) {
   const id=eventKey(batch.accountId,record,event);
   const occurredAt=new Date(sourceDate(event.date)).toISOString();
   for (const dimension of ['listening','spelling']) {
    const evidenceId=`${id}:${dimension}`;
    if (next.vocabularyEvidence.some(item=>item.id===evidenceId)) continue;
    recordVocabularyEvidence(next,{id:evidenceId,entryId:item.id,skill:'listening',sourceType,sourceId:key,bookId,unitId:record.unitId || undefined,dimension,mode:'dictation',result:event.correct?'success':'failure',response:event.response,occurredAt,imported:true,scheduling:false,verification:'source-record'});
   }
   if (!next.vocabularyReviews.some(review=>review.id===id)) next.vocabularyReviews.push({id,entryId:item.id,senseId,mode:'dictation',result:event.correct?'success':'failure',response:englishText(event.response),occurredAt,updatedAt:occurredAt,bookId,unitId:record.unitId || undefined,imported:true,verification:'source-record'});
  }
  const learning=next.vocabularyStates.find(learning=>learning.entryId===item.id && learning.senseId===senseId);
  for (const event of record.history.filter(event=>!meaningfulDate(event.date) && typeof event.correct==='boolean')) {
   const id=eventKey(batch.accountId,record,event);
   if (!next.vocabularyReviews.some(review=>review.id===id)) next.vocabularyReviews.push({id,entryId:item.id,senseId,mode:'dictation',result:event.correct?'success':'failure',response:englishText(event.response),occurredAt:null,updatedAt:batch.exportedAt || item.updatedAt,bookId,unitId:record.unitId || undefined,sourceLabel:event.sourceLabel || `Source answer ${event.id}`,sourceHistoryId:event.hierarchyRecordId,imported:true,verification:'source-record',scheduling:false});
  }
  const newerLocalEvidence=next.vocabularyEvidence.some(evidence=>evidence.entryId===item.id && !evidence.imported && (!batch.exportedAt || Date.parse(evidence.occurredAt)>Date.parse(batch.exportedAt)));
  if (learning && record.currentlyWrong && !newerLocalEvidence) {
   learning.wrong.active=true;
   learning.wrong.reason='Imported Guixue summary; current wrong status';
   learning.wrong.modes.dictation={...learning.wrong.modes.dictation,active:true,successesSinceFailure:0};
  }
  if (batch.provider==='guixue' && !next.wordbookEnrollments.some(enrollment=>enrollment.bookId===bookId)) next.wordbookEnrollments.push({id:`import-enrollment:${bookId}`,bookId,updatedAt:batch.exportedAt || item.updatedAt});
 }
 for (const book of batch.books) for (const unit of book.units || []) {
  if (!unit.record) continue;
  const id=`guixue-progress:${batch.accountId}:${book.sourceBookId}:${unit.id}`;
  const completedEntryIds=[...new Set(batch.records.filter(record=>record.sourceBookId===book.sourceBookId && record.unitId===unit.id && record.history.length).map(record=>next.vocabulary.find(entry=>normalizeAnswer(entry.term)===normalizeAnswer(record.term))?.id).filter(Boolean))];
  const sourceReports={hierarchy:book.reports?.hierarchy?.table?.find(row=>String(row.id)===String(unit.id)) || null,allCount:book.reports?.allCount?.table?.find(row=>String(row.id)===String(unit.id)) || null};
  const summary={id,bookId:`guixue:${book.sourceBookId}`,unitId:unit.id,completedEntryIds,status:'imported-summary',sourceRecord:unit.record,sourceReports,updatedAt:batch.exportedAt || 'source-time-unknown'};
  const existing=next.wordbookProgress.find(progress=>progress.id===id);
  if (existing) { existing.sourceRecord=unit.record; existing.sourceReports=book.reports; } else next.wordbookProgress.push(summary);
 }
 next.vocabularyImportBatches.push({id:batchId,provider:batch.provider,accountId:batch.accountId,exportedAt:batch.exportedAt || null,fingerprints:batchPrints,summaries,books:batch.books,report});
 for (const key of arrays) state[key]=next[key];
 return report;
}

export const parseGuixueSnapshot = (input) => parseVocabularyImport(input,'guixue');
