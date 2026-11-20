#!/usr/bin/env node
/** Read-only content audit. Never reads account tables or writes remote data. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateCatalog } from './lib/exam-import.mjs';
import { createClient } from '@supabase/supabase-js';
import { readPrivateExamImage, verifyImageBytes } from './lib/exam-images.mjs';

const args=process.argv.slice(2),options={};
for(let index=0;index<args.length;index++) {
  const flag=args[index];
  if(flag==='--published'){options.published=true;continue;}
  if(!['--database','--catalog','--out'].includes(flag)||!args[index+1]||args[index+1].startsWith('--'))throw new Error('Usage: node scripts/audit-exam-integrity.mjs (--database DIRECTORY | --catalog FILE | --published) [--out FILE]');
  options[flag.slice(2)]=path.resolve(args[++index]);
}
if([options.database,options.catalog,options.published].filter(Boolean).length!==1)throw new Error('Choose one input: --database, --catalog or --published.');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const tables={papers:'exam_papers',sections:'exam_sections',passages:'exam_passages',questions:'exam_questions',assets:'exam_assets'};
const catalog=options.catalog?await read(options.catalog):{schemaVersion:1};
if(options.database)for(const [key,table]of Object.entries(tables))catalog[key]=(await read(path.join(options.database,`${table}.json`))).map(row=>row.payload??row);
let bucket;
if (options.published) {
  const endpoint=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!endpoint || !key || new URL(endpoint).protocol !== 'https:') throw new Error('Provide the HTTPS Supabase URL and service role key.');
  const client=createClient(endpoint,key,{ auth:{persistSession:false,autoRefreshToken:false} });
  bucket=client.storage.from('exam-assets');
  await Promise.all(Object.entries(tables).map(async ([name,table])=>{
    catalog[name]=[];
    for (let offset=0;;offset+=500) {
      const {data,error}=await client.from(table).select('id,payload').order('id').range(offset,offset+499);
      if (error) throw new Error(`Could not read shared catalogue table ${table}.`);
      catalog[name].push(...data.map(row=>row.payload));
      if (data.length<500) break;
    }
  }));
}
const slots=question=>question.type==='multiple'&&Number.isInteger(question.points)&&question.points>0?question.points:1;
const validation=validateCatalog(catalog);
let verifiedImages=0;
if (bucket) for (const asset of catalog.assets.filter(row=>row.kind==='image')) {
  try {
    verifyImageBytes(await readPrivateExamImage(bucket,asset,asset.provenance?.contentHash),asset.id);
    verifiedImages++;
  } catch (error) {
    validation.errors.push(error.message);
  }
}
const paperIssues=[];
for(const paper of catalog.papers)for(const skill of ['reading','listening']) {
  const sections=catalog.sections.filter(section=>section.paperId===paper.id&&section.skill===skill);
  if(!sections.length)continue;
  const answerSlots=catalog.questions.filter(question=>sections.some(section=>section.id===question.sectionId)).reduce((sum,question)=>sum+slots(question),0);
  const expectedSections=skill==='reading'?3:4;
  if(sections.length!==expectedSections||answerSlots!==40)paperIssues.push({paperId:paper.id,skill,sections:sections.length,expectedSections,answerSlots,expectedAnswerSlots:40});
}
const report={
  ...(options.published?{verifiedImages}:{}),
  counts:{papers:catalog.papers.length,readingSections:catalog.sections.filter(section=>section.skill==='reading').length,listeningSections:catalog.sections.filter(section=>section.skill==='listening').length,questionRows:catalog.questions.length,answerSlots:catalog.questions.reduce((sum,question)=>sum+slots(question),0)},
  sectionCountMismatches:validation.errors.filter(error=>error.startsWith('Question-count mismatch')),
  sourceNumberWarnings:validation.warnings.filter(warning=>/^(?:Invalid question number|Duplicate question number|Missing declared question numbers)/.test(warning)),
  paperIssues,
  ...validation,
};
if(options.out){await fs.mkdir(path.dirname(options.out),{recursive:true});await fs.writeFile(options.out,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({...report,warnings:report.warnings.length,sourceNumberWarnings:report.sourceNumberWarnings},null,2));
if(report.errors.length||paperIssues.length)process.exitCode=1;
