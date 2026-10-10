/* Run this whole script in the developer console of your signed-in Guixue word page.
 * Read requests only (GET and the official read-only review POST).
 * The token stays in this closure and is never exported or logged.
 * A download contains your personal vocabulary history; keep it private.
 */
(async function exportGuixueVocabulary() {
  'use strict';
  if (!['www.guixue.com','guixue.com','v.guixue.com'].includes(location.hostname)) throw new Error('Run this on the official Guixue site.');
  const login = JSON.parse(localStorage.getItem('_USER_INFO') || 'null');
  if (!login?.uid || !login?.token) throw new Error('Sign in to Guixue before exporting.');
  const accountId = String(login.uid);
  const sourceBooks = [
    ['10174','IELTS Vocabulary (Liu Hongbo)'], ['10176','IELTS Reading 538 Key Words'],
    ['11320','IELTS Listening Corpus (Core Chapters)'], ['10177','IELTS Listening 179 Key Words'],
    ['21953','Cambridge IELTS 21 Listening'], ['10216','Cambridge IELTS 20 Listening'],
  ];
  const snapshot = {schemaVersion:1,provider:'guixue',accountId,exportedAt:new Date().toISOString(),books:[],records:[],failures:[]};
  const endpoint = 'https://v.guixue.com/ApiDictaction/';
  async function read(name, params) {
    const url = new URL(name,endpoint);
    Object.entries(params).forEach(([key,value]) => url.searchParams.set(key,String(value)));
    const readOnlyPost=name==='getDictationReview';
    const response = await fetch(readOnlyPost?new URL(name,endpoint):url,{method:readOnlyPost?'POST':'GET',credentials:'omit',headers:{Authorization:login.token,'X-User-Agent':'92:1.0.4',...(readOnlyPost?{'Content-Type':'application/json'}:{})},...(readOnlyPost?{body:JSON.stringify(params)}:{})});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result=await response.json();
    if (String(result.e)!=='9999') throw new Error(`Source response ${String(result.e)}`);
    return result.data;
  }
  function hierarchy(nodes, parentId=null, path=[]) {
    return (nodes || []).flatMap((node,index)=>{
      const id=String(node.book_hierarchy_id || node.id);
      const title=/[\u3400-\u9fff]/.test(node.title || '') ? `Level ${node.level || 1}, group ${index+1}` : String(node.title || `Group ${index+1}`);
      const unit={id,parentId,title,order:index,level:Number(node.level || 1),totalSourceWords:node.sub_step?.length ? null : Number(node.sub_level_num || 0),path:[...path,id],record:selectSummary(node.record)};
      return [unit,...hierarchy(node.sub_step,id,unit.path)];
    });
  }
  function selectSummary(raw) {
    if (!raw || typeof raw!=='object') return null;
    const allowed=['id','book_id','book_hierarchy_id','words_num','total','practice','practice_progress','wrong_word_count','avg_rate','correct_rate','wrong_num','last_correct','is_fix','date','create_time','time','rate','key'];
    if (Array.isArray(raw)) return raw.map(selectSummary).filter(Boolean);
    return Object.fromEntries(allowed.filter(key=>raw[key]!=null && ['string','number','boolean'].includes(typeof raw[key])).map(key=>[key,raw[key]]));
  }
  function reportSummary(raw) {
    if (!raw) return null;
    const numericReport=(value)=>{
      if (Array.isArray(value)) return value.map(numericReport);
      if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).filter(([key])=>!(/token|cookie|authorization|password|mobile|phone|avatar|name/i.test(key))).map(([key,item])=>[key,numericReport(item)]));
      return typeof value==='string' && /[\u3400-\u9fff]/.test(value)?null:value;
    };
    return {summary:selectSummary(raw),report:numericReport(raw.report || null),countInfo:numericReport(raw.count_info || null),table:(raw.table_data || []).map(selectSummary),chart:(raw.chart_data || []).map(node=>({id:String(node.id || ''),data:Array.isArray(node.data)?node.data.map(selectSummary):[]}))};
  }
  function mergeWords(bookId, unitId, words, rows=[]) {
    for (const word of words || []) {
      const term=String(word.word ?? word.term ?? '').trim();
      if (!term) continue;
      const sourceWordId=String(word.id ?? word.word_id ?? '');
      if (!sourceWordId) { snapshot.failures.push({sourceBookId:bookId,unitId,kind:'missing-word-identity'}); continue; }
      const key=JSON.stringify([bookId,unitId,sourceWordId]);
      let record=snapshot.records.find(record=>JSON.stringify([record.sourceBookId,record.unitId,record.sourceWordId])===key);
      if (!record) {
        record={sourceBookId:bookId,unitId,sourceWordId,term,wrongCount:0,lastCorrect:null,repaired:false,history:[],avgRate:null};
        snapshot.records.push(record);
      }
      if (word.wrong_num != null) record.wrongCount=Number(word.wrong_num);
      if (word.last_correct != null) record.lastCorrect=String(word.last_correct);
      if (word.is_fix != null) record.repaired=String(word.is_fix)==='1';
      if (word.avg_rate != null) record.avgRate=word.avg_rate;
      const dates=new Map(rows.map(row=>[String(row.key),row.date || row.create_time || null]));
      for (const [historyId,event] of Object.entries(word.records || {})) {
        if (record.history.some(old=>old.id===historyId)) continue;
        const correct=String(event.is_correct)==='1'?true:String(event.is_correct)==='2'?false:null;
        const candidateDate=event.date || event.create_time || dates.get(historyId) || null;
        const validDate=typeof candidateDate==='string' && /^\d{4}-\d{2}-\d{2}/.test(candidateDate);
        record.history.push({id:historyId,hierarchyRecordId:event.hierarchy_record_id == null ? null : String(event.hierarchy_record_id),sourceLabel:`History ${String(historyId).replace(/^key/,'')}`,date:validDate?candidateDate:null,response:String(event.user_input || ''),correct});
      }
    }
  }
  async function capture(bookId,kind,params) {
    try { return await read(kind,params); }
    catch (error) { snapshot.failures.push({sourceBookId:bookId,unitId:params.book_hierarchy_id || null,kind,reason:error.message}); return null; }
  }
  for (const [bookId,title] of sourceBooks) {
    const detail=await capture(bookId,'dictationBookDetail',{book_id:bookId});
    if (!detail) continue;
    const units=hierarchy(detail.sub_step);
    const book={sourceBookId:bookId,title,totalSourceWords:Number(detail.detail?.total || 0),followed:Boolean(detail.detail?.is_followed),owned:Boolean(detail.detail?.is_owner),units,coverage:'pending',importedEntryCount:0,unitCoverage:[],reports:{}};
    snapshot.books.push(book);
    book.reports.hierarchy=reportSummary(await capture(bookId,'allHierarchyRecord',{book_id:bookId}));
    book.reports.allCount=reportSummary(await capture(bookId,'allCount',{book_id:bookId}));
    for (const unit of units.filter(unit=>unit.totalSourceWords!=null)) {
      const params={book_id:bookId,book_hierarchy_id:unit.id};
      const practice=await capture(bookId,'getPracticePageInfo',params);
      if (practice?.words) mergeWords(bookId,unit.id,practice.words);
      const history=await capture(bookId,'getWrongWord',{...params,all:1});
      if (history?.words) mergeWords(bookId,unit.id,history.words,history.row || []);
      const count=snapshot.records.filter(record=>record.sourceBookId===bookId && record.unitId===unit.id).length;
      book.unitCoverage.push({unitId:unit.id,expected:unit.totalSourceWords,imported:count,complete:Boolean((practice?.words || history?.words) && count===unit.totalSourceWords)});
    }
    const reviewSummaries=[];
    const seenPages=new Set();
    // Review is paginated by the official app; keep fetching until the returned page is short.
    for (let page=1;page<=10000;page++) {
      const review=await capture(bookId,'getDictationReview',{book_id:bookId,page,limit:100,order:'update'});
      if (!review) break;
      const words=review.list || review.words || [];
      if (!Array.isArray(words)) { snapshot.failures.push({sourceBookId:bookId,kind:'unsupported-review-shape'}); break; }
      const ids=JSON.stringify(words.map(word=>String(word.id)));
      if (seenPages.has(ids)) { snapshot.failures.push({sourceBookId:bookId,kind:'repeated-review-page'}); break; }
      seenPages.add(ids);
      reviewSummaries.push(...words.map(word=>({sourceWordId:String(word.id || ''),wrongCount:Number(word.wrong_num || 0),lastCorrect:word.last_correct == null?null:String(word.last_correct),repaired:String(word.is_fix)==='1',avgRate:word.avg_rate ?? null})));
      if (words.length<100) break;
    }
    book.reports.review=reviewSummaries;
    for (const summary of reviewSummaries) for (const record of snapshot.records.filter(record=>record.sourceBookId===bookId && record.sourceWordId===summary.sourceWordId)) {
      record.wrongCount=Math.max(record.wrongCount,summary.wrongCount);
      if (record.lastCorrect==null && summary.lastCorrect!=null) record.lastCorrect=summary.lastCorrect;
      if (record.avgRate==null && summary.avgRate!=null) record.avgRate=summary.avgRate;
    }
    book.importedEntryCount=snapshot.records.filter(record=>record.sourceBookId===bookId).length;
    book.coverage=book.unitCoverage.length>0 && book.unitCoverage.every(unit=>unit.complete)?'complete':book.importedEntryCount?'partial':'pending';
    console.info(`Exported ${title}: ${book.importedEntryCount}/${book.totalSourceWords} source memberships (${book.coverage}).`);
  }
  const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});
  const link=document.createElement('a');
  const downloadUrl=URL.createObjectURL(blob);
  link.href=downloadUrl; link.download=`guixue-vocabulary-${accountId}-${new Date().toISOString().slice(0,10)}.json`; link.click();
  setTimeout(()=>URL.revokeObjectURL(downloadUrl),1000);
  console.info(`Personal export complete: ${snapshot.records.length} source memberships; ${snapshot.failures.length} unavailable reads. No source account changes were made.`);
})();
