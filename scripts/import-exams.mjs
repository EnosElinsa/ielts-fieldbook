import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { normalizeSourceSection, validateCatalog, hash } from './lib/exam-import.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=path.join(root,'local/exam-source/raw'),output=path.join(root,'local/exam-bank');
await fs.mkdir(path.join(output,'sections'),{recursive:true});await fs.mkdir(path.join(output,'assets'),{recursive:true});
const catalog={schemaVersion:1,papers:[],sections:[],passages:[],questions:[],assets:[]}, failures=[];
for(const file of await fs.readdir(input)) {
  if(!file.endsWith('.json'))continue;
  try {const part=normalizeSourceSection(JSON.parse(await fs.readFile(path.join(input,file),'utf8')));for(const key of ['papers','sections','passages','questions','assets'])catalog[key].push(...part[key]);}
  catch(error){failures.push({file,reason:error.message});}
}
for(const key of ['papers','sections','passages','questions','assets'])catalog[key]=[...new Map(catalog[key].map(row=>[row.id,row])).values()];
// Mirror media images and replace only source URLs; never render remote source HTML scripts.
for(const q of catalog.questions) {
 const sources=[...q.stimulusHtml.matchAll(/src="([^"]+)"/g)].map(m=>m[1]);
 for(const sourceUrl of sources) {
   const ext=path.extname(new URL(sourceUrl).pathname)||'.jpg', storagePath=`images/${hash(sourceUrl).slice(0,24)}${ext}`;
   const id=`image:${hash(sourceUrl).slice(0,24)}`;
   if(!catalog.assets.some(a=>a.id===id))catalog.assets.push({id,sectionId:q.sectionId,paperId:q.paperId,kind:'image',storagePath,sourceUrl,provenance:q.provenance});
   q.stimulusHtml=q.stimulusHtml.replaceAll(sourceUrl,`exam-asset:${id}`);
 }
}
let index=0,downloaded=0;
await Promise.all(Array.from({length:4},async()=>{while(index<catalog.assets.length){const asset=catalog.assets[index++];const file=path.join(output,'assets',asset.storagePath);await fs.mkdir(path.dirname(file),{recursive:true});
 try {
  let exists=false;try{exists=(await fs.stat(file)).size>0;}catch{}
  if(!exists){const res=await fetch(asset.sourceUrl,{signal:AbortSignal.timeout(90000)});if(!res.ok)throw new Error(`HTTP ${res.status}`);await fs.writeFile(file,Buffer.from(await res.arrayBuffer()));}
  asset.provenance={...asset.provenance,contentHash:hash(await fs.readFile(file))};
  if(asset.kind==='audio'){try{asset.duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file],{encoding:'utf8'}).trim());}catch{failures.push({assetId:asset.id,reason:'Audio duration probe failed'});}}
  downloaded++;if(downloaded%50===0)console.log(`Mirrored ${downloaded}/${catalog.assets.length} assets`);
 }catch(error){asset.unavailable=true;failures.push({assetId:asset.id,reason:error.message});}
}}));
for(const section of catalog.sections){const qs=catalog.questions.filter(q=>q.sectionId===section.id),assets=catalog.assets.filter(a=>a.sectionId===section.id);if(assets.some(a=>a.unavailable)||!qs.length)section.status='incomplete';
 const audio=assets.find(a=>a.id===section.assetId);
 for(const sentence of section.sentences)if(!Number.isFinite(sentence.start)||!Number.isFinite(sentence.end)||sentence.start<0||sentence.end<=sentence.start||audio?.duration&&sentence.end>audio.duration+.25){delete sentence.start;delete sentence.end;sentence.alignment='unavailable';}
 for(const q of qs){const sentence=section.sentences.find(s=>s.id===q.evidence?.sentenceId);if(sentence?.alignment==='unavailable'){delete q.evidence.start;delete q.evidence.end;}}
}
const audit=validateCatalog(catalog);
for(const section of catalog.sections){const part={schemaVersion:1,papers:catalog.papers.filter(p=>p.id===section.paperId),sections:[section],passages:catalog.passages.filter(p=>p.sectionId===section.id),questions:catalog.questions.filter(q=>q.sectionId===section.id),assets:catalog.assets.filter(a=>a.sectionId===section.id)};await fs.writeFile(path.join(output,'sections',`${section.id.replaceAll(':','_')}.json`),JSON.stringify(part));}
await fs.writeFile(path.join(output,'catalog.json'),JSON.stringify(catalog));
const metadata={schemaVersion:1,papers:catalog.papers,sections:catalog.sections.map(s=>({...s,sentences:[]})),passages:[],questions:[],assets:[]};
await fs.writeFile(path.join(output,'metadata.json'),JSON.stringify(metadata));
await fs.mkdir(path.join(root,'public/data'),{recursive:true});await fs.writeFile(path.join(root,'public/data/exam-catalog.json'),JSON.stringify({...metadata,sections:metadata.sections.map(s=>({...s,status:'incomplete'}))}));
const report={papers:catalog.papers.length,listeningSections:catalog.sections.filter(s=>s.skill==='listening').length,readingSections:catalog.sections.filter(s=>s.skill==='reading').length,questions:catalog.questions.length,answerSlots:catalog.questions.reduce((n,q)=>n+q.points,0),sentences:catalog.sections.reduce((n,s)=>n+s.sentences.length,0),assets:catalog.assets.length,downloaded,missingAnswers:catalog.questions.filter(q=>!q.answer||(Array.isArray(q.answer)&&!q.answer.length)).map(q=>q.id),missingExplanations:catalog.questions.filter(q=>!q.explanation).map(q=>q.id),missingTranscripts:catalog.sections.filter(s=>s.skill==='listening'&&!s.sentences.length).map(s=>s.id),failures,...audit};
await fs.writeFile(path.join(output,'audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(failures.length||audit.errors.length)process.exitCode=1;
