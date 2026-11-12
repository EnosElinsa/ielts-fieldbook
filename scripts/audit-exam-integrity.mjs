#!/usr/bin/env node
/** Read-only content audit. Never reads account tables or writes remote data. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateCatalog } from './lib/exam-import.mjs';

const args=process.argv.slice(2),options={};
for(let index=0;index<args.length;index++) {
  const flag=args[index];
  if(!['--database','--catalog','--out'].includes(flag)||!args[index+1]||args[index+1].startsWith('--'))throw new Error('Usage: node scripts/audit-exam-integrity.mjs (--database DIRECTORY | --catalog FILE) [--out FILE]');
  options[flag.slice(2)]=path.resolve(args[++index]);
}
if(Boolean(options.database)===Boolean(options.catalog))throw new Error('Choose one --database directory or --catalog file.');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const tables={papers:'exam_papers',sections:'exam_sections',passages:'exam_passages',questions:'exam_questions',assets:'exam_assets'};
const catalog=options.catalog?await read(options.catalog):{schemaVersion:1};
if(options.database)for(const [key,table]of Object.entries(tables))catalog[key]=(await read(path.join(options.database,`${table}.json`))).map(row=>row.payload??row);
const slots=question=>question.type==='multiple'&&Number.isInteger(question.points)&&question.points>0?question.points:1;
const validation=validateCatalog(catalog);
const paperIssues=[];
for(const paper of catalog.papers)for(const skill of ['reading','listening']) {
  const sections=catalog.sections.filter(section=>section.paperId===paper.id&&section.skill===skill);
  if(!sections.length)continue;
  const answerSlots=catalog.questions.filter(question=>sections.some(section=>section.id===question.sectionId)).reduce((sum,question)=>sum+slots(question),0);
  const expectedSections=skill==='reading'?3:4;
  if(sections.length!==expectedSections||answerSlots!==40)paperIssues.push({paperId:paper.id,skill,sections:sections.length,expectedSections,answerSlots,expectedAnswerSlots:40});
}
const report={
  counts:{papers:catalog.papers.length,readingSections:catalog.sections.filter(section=>section.skill==='reading').length,listeningSections:catalog.sections.filter(section=>section.skill==='listening').length,questionRows:catalog.questions.length,answerSlots:catalog.questions.reduce((sum,question)=>sum+slots(question),0)},
  sectionCountMismatches:validation.errors.filter(error=>error.startsWith('Question-count mismatch')),
  sourceNumberWarnings:validation.warnings.filter(warning=>/^(?:Invalid question number|Duplicate question number|Missing declared question numbers)/.test(warning)),
  paperIssues,
  ...validation,
};
if(options.out){await fs.mkdir(path.dirname(options.out),{recursive:true});await fs.writeFile(options.out,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({...report,warnings:report.warnings.length,sourceNumberWarnings:report.sourceNumberWarnings},null,2));
if(report.errors.length||paperIssues.length)process.exitCode=1;
