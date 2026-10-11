import { parseFragment } from 'parse5';
import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(typeof value === 'string' || ArrayBuffer.isView(value) ? value : JSON.stringify(value)).digest('hex');
const allowed = new Set(['p','div','section','span','strong','b','em','i','u','br','table','thead','tbody','tr','td','th','ul','ol','li','h1','h2','h3','h4','sup','sub','img']);
const escape = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const fragment = value => parseFragment(String(value || '').replaceAll('\\"','"'));
export function htmlText(value) {
  function read(node) {
    if(node.nodeName==='#text')return node.value;
    if(['script','style'].includes(node.tagName))return '';
    return (node.childNodes||[]).map(read).join('')+(['p','div','tr','li','br','section'].includes(node.tagName)?'\n':'');
  }
  return read(fragment(value)).replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n+/g,'\n').trim();
}
export function safeHtml(value) {
  function render(node) {
    if(node.nodeName==='#text')return escape(node.value).replace(/#####-(\d+)-#####/g,'<strong>[$1 ____]</strong>').replace(/\^+_[\s\S]*?_\^+/g,'');
    if(['script','style','iframe','object','embed','form'].includes(node.tagName))return '';
    const inner=(node.childNodes||[]).map(render).join('');
    if(!allowed.has(node.tagName))return inner;
    const attrs=(node.attrs||[]).filter(a=>['colspan','rowspan','alt'].includes(a.name)||a.name==='src'&&/^https:\/\/(?:resource|uimg|img1|static)\.gximg\.cn\//.test(a.value)).map(a=>` ${a.name}="${escape(a.value)}"`).join('');
    return `<${node.tagName}${attrs}>${inner}${['br','img'].includes(node.tagName)?'':`</${node.tagName}>`}`;
  }
  return render(fragment(value));
}
export function sourceType(section, instructions) {
  const names=(section.options||[]).map(o=>htmlText(o.title).toUpperCase());
  if(names.includes('TRUE')&&names.includes('FALSE'))return 'true-false';
  if(names.includes('YES')&&names.includes('NO'))return 'yes-no';
  if(/headings?/i.test(instructions))return 'heading';
  const type=String(section.type);
  if(type==='2')return 'multiple';
  if(/flow.?chart/i.test(instructions))return 'flow';
  if(/label the (?:map|plan)/i.test(instructions))return 'map';
  if(/summary/i.test(instructions))return 'summary';
  if(type==='1')return 'single';
  if(['7','10','15','16','17'].includes(type))return 'gap';
  if(['4','5','9','11','12','13','14','18','19','20','21','22','24','26','28','29'].includes(type))return 'matching';
  throw new Error(`Unknown source question type ${type}`);
}
const sentenceText = text => htmlText(text).replace(/^(?:[A-Z][A-Z\s]{0,30}):\s*/, '').replace(/Q\d+解析/g, '').trim();
export function normalizeSourceSection(raw) {
  const {job}=raw,detail=raw.detail?.[0]||raw.detail?.['0'];
  if(!detail?.pages?.length)throw new Error(`Section ${job.id} has no question pages`);
  const report=raw.report?.data||{};
  const skill=job.classify===1?'listening':'reading', sectionId=`source:${job.id}`,paperId=`cambridge:${job.book}:${job.test}`;
  const provenance={sourceUrl:job.url,sourceVersion:'ieltscb-2026-10',fetchedAt:raw.fetchedAt||new Date().toISOString(),contentHash:hash({detail,report}),authorization:'User confirmed authorized/internal use'};
  const paper={id:paperId,book:job.book,test:job.test,title:`Cambridge IELTS ${job.book} · Test ${job.test}`,provenance};
  const analysis=report.analysis?.list||[];
  const answers=report.answer?.list||[];
  const questions=[], assets=[];
  const audioUrl=detail.audio||report.audio;
  const audioId=`audio:${job.id}`;
  if(audioUrl)assets.push({id:audioId,sectionId,paperId,kind:'audio',storagePath:`audio/${hash(audioUrl).slice(0,24)}.mp3`,sourceUrl:audioUrl,provenance});
  const sentences=(report.content?.list||[]).filter(s=>s.content&&sentenceText(s.content)&&!/^<.*>$/.test(s.content.trim())).map(s=>({id:`source:${s.id}`,text:sentenceText(s.content),start:Number(s.begin_time)/1000,end:Number(s.end_time)/1000,alignment:'source',questionIds:[]}));
  for(const [pageIndex,page] of detail.pages.entries()) {
    const instructions=htmlText(page.desc), stimulusHtml=safeHtml(page.desc||'')+safeHtml(page.content||''),groupId=`source:${job.id}:page:${pageIndex}`;
    for(const section of page.sections||[]) {
      const type=sourceType(section,instructions);
      const chooseFromList=/correct letter|from (?:the )?(?:box|list)\b|using the list|list of (?:words|phrases)/i.test(instructions);
      const isText=['gap','map','flow','summary'].includes(type)&&!chooseFromList&&(/(?:WORD|NUMBER)/i.test(instructions)||['7','10','15','16','17'].includes(String(section.type)));
      const opts=(section.options||[]).map(o=>({id:String(o.id),text:htmlText(o.title)}));
      const choiceRange=[...(instructions+' '+htmlText(page.content)).matchAll(/\b([A-Z])\s*[-–—]\s*([A-Z])\b/g)].filter(m=>m[2]>=m[1]).sort((a,b)=>(b[2].charCodeAt(0)-b[1].charCodeAt(0))-(a[2].charCodeAt(0)-a[1].charCodeAt(0)))[0];
      const options=!isText&&opts.length&&opts.every(o=>/^[A-Z]$/.test(o.text))&&choiceRange
        ? Array.from({length:choiceRange[2].charCodeAt(0)-choiceRange[1].charCodeAt(0)+1},(_,i)=>String.fromCharCode(choiceRange[1].charCodeAt(0)+i)) : opts.map(o=>o.text);
      const qs=type==='multiple'?section.questions.slice(0,1):section.questions;
      for(const q of qs) {
        const number=Number(q.sort)||Number(String(q.title).match(/^\d+/)?.[0]);
        if(!number)throw new Error(`Missing source question number ${q.id}`);
        const answerIds=[...new Set((type==='multiple'?section.questions:[q]).flatMap(row=>String(row.option_ids||'').split('|').filter(Boolean)))];
        const answerValues=String(q.option_names||'').split('|').map(htmlText).filter(Boolean);
        const answer=isText?answerValues[0]:answerIds.map(id=>opts.find(o=>o.id===id)?.text).filter(Boolean);
        const a=answers.find(a=>String(a.question_id)===String(q.id))?.analysis||analysis.find(a=>Number(a.sort)===number)||{};
        const wordMatch=instructions.match(/(?:NO MORE THAN )?(ONE|TWO|THREE|FOUR|\d+)\s+WORDS?/i);
        const wordLimit=wordMatch?({ONE:1,TWO:2,THREE:3,FOUR:4}[wordMatch[1].toUpperCase()]||Number(wordMatch[1])):undefined;
        let prompt=htmlText(q.title);
        if(!prompt||/^\d+[.\s]*$/.test(prompt))prompt=`Question ${number} · Complete the marked gap in the ${type==='map'?'map':'text above'}.`;
        const evidenceText=htmlText(a.answer_en||a.en||'');
        const found=sentences.find(s=>s.id===`source:${a.origin_id}`)||sentences.find(s=>evidenceText&&s.text.includes(sentenceText(evidenceText)));
        const item={id:`question:${q.id}`,paperId,sectionId,skill,number,type,prompt,instructions,stimulusHtml,groupTitle:page.title,groupId,answer:type==='multiple'?answer:typeof answer==='string'?answer:answer[0]||answerValues[0]||'',options:isText?undefined:options,alternatives:isText?answerValues.slice(1):undefined,maxWords:isText?wordLimit:undefined,points:type==='multiple'?section.questions.length:1,explanation:[evidenceText,a.related?`Paraphrase: ${htmlText(a.related)}`:''].filter(Boolean).join('\n'),evidence:evidenceText||found?{text:evidenceText||found.text,sentenceId:found?.id,start:found?.start,end:found?.end}:undefined,provenance};
        if(found)found.questionIds.push(item.id);
        if(htmlText(a.stem).length>1)item.sourceExplanation=htmlText(a.stem);
        questions.push(item);
      }
    }
  }
  const passages=[];
  if(skill==='reading') {
    const content=htmlText(detail.content), lines=content.split('\n').filter(Boolean);
    const title=htmlText(report.content_title)||lines[0]||`${paper.title} · Passage ${job.part}`;
    const body=lines[0]===title?lines.slice(1):lines;
    const paragraphs=[];
    if(body.some(line=>/^[A-Z]$/.test(line))) {
      for(const line of body)if(/^[A-Z]$/.test(line)||!paragraphs.length)paragraphs.push(line);else paragraphs[paragraphs.length-1]+=` ${line}`;
    }else paragraphs.push(...body);
    passages.push({id:`passage:${job.id}`,sectionId,title,paragraphs:paragraphs.map((text,i)=>({id:`paragraph:${job.id}:${i}`,text})),provenance});
  }
  const section={id:sectionId,paperId,skill,part:job.part,title:`${skill==='reading'?'Passage':'Part'} ${job.part}`,questionTypes:[...new Set(questions.map(q=>q.type))],questionCount:questions.reduce((n,q)=>n+(q.points||1),0),assetId:audioUrl?audioId:undefined,sentences,status:questions.length&&questions.every(q=>Array.isArray(q.answer)?q.answer.length:q.answer)?'ready':'incomplete',provenance};
  return {schemaVersion:1,papers:[paper],sections:[section],passages,questions,assets};
}
export function validateCatalog(catalog) {
  const errors=[],warnings=[];
  const sectionIds=new Set((catalog.sections||[]).map(s=>s.id)),questionIds=new Set();
  if(catalog.schemaVersion!==1)errors.push('Unsupported catalog version');
  for(const key of ['papers','sections','questions','passages','assets'])if(!Array.isArray(catalog[key]))errors.push(`${key} must be an array`);
  for(const q of catalog.questions||[]) {
    if(questionIds.has(q.id))errors.push(`Duplicate question ${q.id}`);questionIds.add(q.id);
    if(!sectionIds.has(q.sectionId))errors.push(`Missing section for ${q.id}`);
    if(!q.answer||(Array.isArray(q.answer)&&!q.answer.length))errors.push(`Missing answer ${q.id}`);
    if(q.options?.length&&!(Array.isArray(q.answer)?q.answer:[q.answer]).every(a=>q.options.includes(a)))errors.push(`Answer outside options ${q.id}`);
    if(q.maxWords!==undefined&&q.type!=='multiple') {
      const permitsNumber=/\b(?:AND\s*\/\s*OR|AND|OR)\s+A\s+NUMBER\b/i.test(q.instructions||'');
      const possible=[...(Array.isArray(q.answer)?q.answer:[q.answer]),...(q.alternatives||[])].filter(answer=>typeof answer==='string'&&answer.trim());
      if(possible.length&&!possible.some(answer=>answer.trim().split(/\s+/).filter(word=>!permitsNumber||!/\d/.test(word)).length<=q.maxWords))warnings.push(`Answer conflicts with word limit ${q.id}`);
    }
  }
  for(const s of catalog.sections||[]) {
    const audio=(catalog.assets||[]).find(a=>a.id===s.assetId);
    if(s.skill==='reading'&&!(catalog.passages||[]).some(p=>p.sectionId===s.id&&p.paragraphs?.some(p=>p.text?.trim())))errors.push(`Missing reading passage ${s.id}`);
    if(s.skill==='listening'&&!s.assetId)warnings.push(`Missing audio ${s.id}`);
    if(s.skill==='listening'&&!s.sentences?.length)warnings.push(`Missing transcript ${s.id}`);
    for(const sentence of s.sentences||[])if(!Number.isFinite(sentence.start)||!Number.isFinite(sentence.end)||sentence.start<0||sentence.end<=sentence.start||audio?.duration&&sentence.end>audio.duration+.25)warnings.push(`Missing/invalid timestamps ${s.id}/${sentence.id}`);
  }
  return {errors,warnings};
}
