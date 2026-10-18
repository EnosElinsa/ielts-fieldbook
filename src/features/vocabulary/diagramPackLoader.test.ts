import {expect,test,vi} from 'vitest';
import {createVocabularyDiagramLoader} from './diagramLoader';
import {installPageLoadRecovery} from '../../lib/pageLoadRecovery';
const Renderer=()=>null,module={VocabularyMeaningDiagram:Renderer};
const descriptor=(id:string,load:()=>Promise<typeof module>)=>({id,moduleName:'VocabularyDiagramScenes'+id.toUpperCase(),load});
const url=(name:string)=>new URL('/assets/'+name+'-abc123.js',window.location.origin).href;

test('same-pack requests share an import while different packs load independently',async()=>{
 let finishB!:(m:typeof module)=>void,finishC!:(m:typeof module)=>void;
 const b=vi.fn(()=>new Promise<typeof module>(r=>{finishB=r;})),c=vi.fn(()=>new Promise<typeof module>(r=>{finishC=r;})),packs={b:descriptor('b',b),c:descriptor('c',c)},loader=createVocabularyDiagramLoader(kind=>kind.startsWith('bank')?packs.b:packs.c);
 expect(loader.keyFor('bank-river')).toBe('b');expect(loader.peek('bank-river')).toBeUndefined();expect(b).not.toHaveBeenCalled();
 const first=loader.load('bank-river'),same=loader.load('bank-loan'),other=loader.load('charge-fee');expect(first).toBe(same);expect(other).not.toBe(first);expect(b).toHaveBeenCalledOnce();expect(c).toHaveBeenCalledOnce();
 finishB(module);expect(await first).toBe(Renderer);expect(loader.peek('bank-loan')).toBe(Renderer);expect(loader.peek('charge-fee')).toBeUndefined();expect(await loader.load('bank-river')).toBe(Renderer);expect(b).toHaveBeenCalledOnce();finishC(module);expect(await other).toBe(Renderer);
});
test('a failed pack clears only its pending load and leaves another cached pack usable',async()=>{
 const b=vi.fn().mockRejectedValueOnce(new TypeError('Offline')).mockResolvedValueOnce(module),c=vi.fn().mockResolvedValue(module),packs={b:descriptor('b',b),c:descriptor('c',c)},loader=createVocabularyDiagramLoader(kind=>kind==='bank'?packs.b:packs.c);
 await expect(loader.load('bank')).rejects.toThrow('Offline');expect(await loader.load('charge')).toBe(Renderer);expect(loader.peek('bank')).toBeUndefined();expect(await loader.load('bank')).toBe(Renderer);expect(await loader.load('charge')).toBe(Renderer);expect(b).toHaveBeenCalledTimes(2);expect(c).toHaveBeenCalledOnce();
});
test('cached download failure retries the exact owned pack with a fresh URL',async()=>{
 const asset=url('VocabularyDiagramScenesB'),importer=vi.fn().mockRejectedValue(new TypeError('Failed to fetch dynamically imported module: '+asset)),retry=vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: '+asset)).mockResolvedValueOnce(module),loader=createVocabularyDiagramLoader(()=>descriptor('b',importer),retry);
 await expect(loader.load('bank')).rejects.toThrow();expect(retry).not.toHaveBeenCalled();await expect(loader.load('bank')).rejects.toThrow();expect(retry).toHaveBeenNthCalledWith(1,asset+'?diagramRetry=1');expect(await loader.load('bank')).toBe(Renderer);expect(retry).toHaveBeenNthCalledWith(2,asset+'?diagramRetry=2');expect(importer).toHaveBeenCalledOnce();
});
test('retry refuses other origins, neighboring packs, shared code and unrelated pages',async()=>{
 for(const asset of ['https://example.test/assets/VocabularyDiagramScenesB-abc.js',url('VocabularyDiagramScenesC'),url('VocabularyDiagramPrimitives'),url('PlanningPage')]){
  const importer=vi.fn().mockRejectedValue(new TypeError('Failed to fetch dynamically imported module: '+asset)),retry=vi.fn(),loader=createVocabularyDiagramLoader(()=>descriptor('b',importer),retry);await expect(loader.load('bank')).rejects.toThrow();await expect(loader.load('bank')).rejects.toThrow();expect(retry).not.toHaveBeenCalled();expect(importer).toHaveBeenCalledTimes(2);
 }
});
test('a later neighboring URL cannot replace a verified retry target',async()=>{
 const asset=url('VocabularyDiagramScenesB'),importer=vi.fn().mockRejectedValue(new TypeError('Failed to fetch dynamically imported module: '+asset)),retry=vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: '+url('VocabularyDiagramScenesC'))).mockResolvedValueOnce(module),loader=createVocabularyDiagramLoader(()=>descriptor('b',importer),retry);
 await expect(loader.load('bank')).rejects.toThrow();await expect(loader.load('bank')).rejects.toThrow();expect(await loader.load('bank')).toBe(Renderer);expect(retry).toHaveBeenNthCalledWith(2,asset+'?diagramRetry=2');
});
test('unknown kinds do not import or guess a pack',async()=>{
 const retry=vi.fn(),loader=createVocabularyDiagramLoader(()=>undefined,retry);expect(loader.keyFor('unknown')).toBeUndefined();expect(loader.peek('unknown')).toBeUndefined();await expect(loader.load('unknown')).rejects.toThrow(/unavailable/i);expect(retry).not.toHaveBeenCalled();
});
test('a synchronous importer exception remains retryable',async()=>{
 const importer=vi.fn().mockImplementationOnce(()=>{throw new Error('Interrupted');}).mockResolvedValueOnce(module),loader=createVocabularyDiagramLoader(()=>descriptor('b',importer));await expect(loader.load('bank')).rejects.toThrow('Interrupted');expect(await loader.load('bank')).toBe(Renderer);
});
test('global recovery defers only an actively locally handled pack failure',async()=>{
 sessionStorage.clear();const reload=vi.fn(),stop=installPageLoadRecovery(reload),failure=new TypeError('Failed to fetch dynamically imported module: '+url('VocabularyDiagramScenesB'));
 const dispatch=()=>{const event=new Event('vite:preloadError',{cancelable:true});Object.assign(event,{payload:failure});window.dispatchEvent(event);};
 try{const loader=createVocabularyDiagramLoader(()=>descriptor('b',async()=>{dispatch();throw failure;}));await expect(loader.load('bank')).rejects.toThrow();expect(reload).not.toHaveBeenCalled();dispatch();expect(reload).toHaveBeenCalledOnce();}finally{stop();sessionStorage.clear();}
});
test('an unrelated pack still receives recovery while another pack is loading',async()=>{
 sessionStorage.clear();const reload=vi.fn(),stop=installPageLoadRecovery(reload);
 const importer=async()=>{const event=new Event('vite:preloadError',{cancelable:true});Object.assign(event,{payload:new TypeError('Failed to fetch dynamically imported module: '+url('VocabularyDiagramScenesC'))});window.dispatchEvent(event);throw new Error('Interrupted');};
 try{await expect(createVocabularyDiagramLoader(()=>descriptor('b',importer)).load('bank')).rejects.toThrow();expect(reload).toHaveBeenCalledOnce();}finally{stop();sessionStorage.clear();}
});
