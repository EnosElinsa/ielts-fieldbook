import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'local/exam-source');
const stateFile = process.argv[2] || path.join(output, 'browser-state.json');
const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
const cookie = state.cookies.filter(c => /(^|\.)ieltscb\.com$/.test(c.domain)).map(c => `${c.name}=${c.value}`).join('; ');
if (!cookie) throw new Error('Sign in to the source browser and export its storage state first.');
await fs.mkdir(path.join(output, 'raw'), { recursive: true });
const failures = [];
async function get(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { cookie }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      if (result.e && result.e !== '9999') throw new Error(`Source response ${result.e}`);
      return result;
    } catch (error) { if (attempt === 2) throw error; }
  }
}
// Shared content exports never retain account data or source-site learning records.
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['mobile','uid','user','user_id','select_answer','text','isright','user_audio','evaluate_result','had_collection','res','res_info','answer_id','answer_value','option_id'].includes(key)).map(([key,v]) => [key,redact(v)]));
  return value;
}
const directories = [];
for (let book = 8; book <= 21; book++) for (const classify of [1,2]) {
  const url = `https://www.ieltscb.com/ReadQuestion/list?p_type=${book}&classify=${classify}`;
  const result = await get(url);
  directories.push({ book, classify, url, tests: result.data.list.map((test, index) => ({ title: test.title.trim(), test: index+1, sections: test.list.map((s, part) => ({ id: s.id, paperId: s.paper_id, title: s.title, types: s.question_type_string, part: part+1, url: s.url, reportUrl: s.report_url })) })) });
}
await fs.writeFile(path.join(output,'directory.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), directories }, null, 2));
const jobs = directories.flatMap(d => d.tests.flatMap(t => t.sections.map(s => ({ ...s, book:d.book, classify:d.classify, test:t.test }))));
let index=0, completed=0;
await Promise.all(Array.from({length:3},async()=>{
  while(index<jobs.length){const job=jobs[index++];
    const file=path.join(output,'raw',`${job.classify}-${job.id}.json`);
    try {
      try { const existing=JSON.parse(await fs.readFile(file,'utf8')); if(existing.detail && existing.report){ completed++;continue; } } catch { /* new item */ }
      const detailUrl=`https://www.ieltscb.com/Paper/detail?id=${job.paperId}&classify=${job.classify}&chapters_id=${job.id}&p_type=${job.book}`;
      const reportUrl=`https://www.ieltscb.com/Report/show?classify=${job.classify}&chapters_id=${job.id}&paper_id=${job.paperId}&p_type=${job.book}&tid=&duration=0`;
      const detail=await get(detailUrl), report=await get(reportUrl);
      await fs.writeFile(file,JSON.stringify({job,detail:redact(detail),report:redact(report),fetchedAt:new Date().toISOString()},null,2));
      completed++;if(completed%28===0)console.log(`Collected ${completed}/${jobs.length} sections`);
    }catch(error){failures.push({sectionId:job.id,skill:job.classify===1?'listening':'reading',reason:error.message});}
  }
}));
await fs.writeFile(path.join(output,'collection-report.json'),JSON.stringify({expected:jobs.length,collected:completed,failures},null,2));
console.log(JSON.stringify({expected:jobs.length,collected:completed,failures:failures.length}));
if(failures.length)process.exitCode=1;
