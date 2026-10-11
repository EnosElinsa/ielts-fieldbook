import { expect, test } from 'vitest';
// @ts-expect-error Node ingestion module used by its CLI and tests.
import { normalizeSourceSection, validateCatalog, htmlText } from '../../scripts/lib/exam-import.mjs';
const job={id:'1',paperId:'p',classify:1,book:21,test:1,part:1,url:'https://www.ieltscb.com/Paper/part/?id=p',types:'填空'};
test('source gaps retain alternatives but never expose answer options and strip account data',()=>{
 const result=normalizeSourceSection({job,fetchedAt:'2026-10-11',detail:{0:{mobile:'secret',audio:'https://uimg.gximg.cn/a.mp3',pages:[{title:'Questions 1–2',desc:'Write ONE WORD ONLY',content:'<table><tr><td>Wear #####-1-#####</td></tr></table><script>bad()</script>',sections:[{id:'g',type:'10',questions:[{id:'q',sort:'1',title:'1',option_names:'coat|jacket',option_ids:'a|b'}],options:[{id:'a',title:'coat'},{id:'b',title:'jacket'}]}]}]}},report:{data:{content:{list:[{id:'s',content:'WOMAN: Wear a coat.',begin_time:'1000',end_time:'3000'}]},analysis:{list:[{sort:'1',origin_id:'s',answer_en:'Wear a coat.'}]}}}});
 expect(result.questions[0]).toMatchObject({answer:'coat',alternatives:['jacket'],options:undefined,evidence:{sentenceId:'source:s'}});
 expect(result.questions[0].stimulusHtml).not.toContain('<script>');
 expect(result.sections[0].sentences[0]).toMatchObject({start:1,end:3,text:'Wear a coat.'});
 expect(JSON.stringify(result)).not.toContain('secret');
});
test('pooled multiple answer slots collapse with accurate points and stable canonical choices',()=>{
 const result=normalizeSourceSection({job,detail:{0:{pages:[{desc:'Choose TWO letters A-C',sections:[{id:'g',type:'2',questions:[{id:'a',sort:'1',title:'Choose TWO reasons',option_ids:'1',option_names:'A cheap'},{id:'b',sort:'2',title:'Choose TWO reasons',option_ids:'3',option_names:'C fast'}],options:[{id:'1',title:'A cheap'},{id:'2',title:'B large'},{id:'3',title:'C fast'}]}]}]}},report:{data:{}}});
 expect(result.questions).toHaveLength(1);
 expect(result.questions[0]).toMatchObject({type:'multiple',points:2,answer:['A cheap','C fast']});
});
test('list-based flow completion retains options and diagrams in instructions',()=>{
 const result=normalizeSourceSection({job,detail:{0:{pages:[{desc:'Complete the flow-chart. Choose SIX answers from the box and write the correct letter A-H.<img src="https://uimg.gximg.cn/map.png">',sections:[{type:'10',questions:[{id:'q',sort:'1',title:'1',option_ids:'c',option_names:'C'}],options:[{id:'a',title:'A'},{id:'c',title:'C'}]}]}]}},report:{data:{}}});
 expect(result.questions[0]).toMatchObject({type:'flow',options:['A','B','C','D','E','F','G','H'],answer:'C',maxWords:undefined});
 expect(result.questions[0].stimulusHtml).toContain('map.png');
});
test('reading answer-sheet boxes never turn word gaps into a leaked choice list',()=>{
 const result=normalizeSourceSection({job:{...job,classify:2},detail:{0:{content:'A source paragraph.',pages:[{desc:'Complete the summary. Choose ONE WORD ONLY from the passage. Write your answers in boxes 21-24 on your answer sheet.',sections:[{type:'15',questions:[{id:'q',sort:'21',title:'21',option_ids:'a',option_names:'birds'}],options:[{id:'a',title:'birds'}]}]}]}},report:{data:{}}});
 expect(result.questions[0]).toMatchObject({answer:'birds',options:undefined,maxWords:1});
});
test('unknown source types and malformed catalogs fail closed',()=>{
 expect(()=>normalizeSourceSection({job,detail:{0:{pages:[{sections:[{type:'999',questions:[{id:'q',sort:'1',option_names:'x'}]}]}]}}})).toThrow(/type/i);
 expect(validateCatalog({schemaVersion:1,papers:[],sections:[],questions:[{id:'q',sectionId:'missing'}],passages:[],assets:[]}).errors.length).toBeGreaterThan(0);
 expect(htmlText('<p>A &amp; B</p><p>C</p>')).toBe('A & B\nC');
});
test('catalog audit flags source answer keys that contradict their word limit',()=>{
 const catalog={schemaVersion:1,papers:[],sections:[{id:'s',skill:'listening',sentences:[],assetId:'audio'}],questions:[{id:'bad',sectionId:'s',answer:'Domestic Life',maxWords:1,instructions:'ONE WORD AND/OR A NUMBER'}, {id:'number',sectionId:'s',answer:'10 days',maxWords:1,instructions:'ONE WORD AND/OR A NUMBER'}, {id:'alternative',sectionId:'s',answer:'animal movement',alternatives:['movement'],maxWords:1,instructions:'ONE WORD ONLY'}],passages:[],assets:[]};
 const warnings=validateCatalog(catalog).warnings;
 expect(warnings).toContain('Answer conflicts with word limit bad');
 expect(warnings).not.toContain('Answer conflicts with word limit number');
 expect(warnings).not.toContain('Answer conflicts with word limit alternative');
});
