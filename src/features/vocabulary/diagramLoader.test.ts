import {expect,test,vi} from 'vitest';
import {createVocabularyDiagramLoader} from './diagramLoader';
import {installPageLoadRecovery} from '../../lib/pageLoadRecovery';

test('simultaneous requests share one import and later requests reuse the loaded renderer',async()=>{
 let finish!:(value:{VocabularyMeaningDiagram:()=>null})=>void;
 const Renderer=()=>null,importModule=vi.fn(()=>new Promise<{VocabularyMeaningDiagram:()=>null}>(resolve=>{finish=resolve;}));
 const loader=createVocabularyDiagramLoader(importModule);
 expect(importModule).not.toHaveBeenCalled();expect(loader.peek()).toBeUndefined();
 const first=loader.load(),second=loader.load();expect(first).toBe(second);expect(importModule).toHaveBeenCalledTimes(1);
 finish({VocabularyMeaningDiagram:Renderer});expect(await first).toBe(Renderer);expect(await second).toBe(Renderer);
 expect(loader.peek()).toBe(Renderer);expect(await loader.load()).toBe(Renderer);expect(importModule).toHaveBeenCalledTimes(1);
});

test('a failed import is cleared so an explicit later request can try again',async()=>{
 const Renderer=()=>null,importModule=vi.fn().mockRejectedValueOnce(new TypeError('Network interrupted')).mockResolvedValueOnce({VocabularyMeaningDiagram:Renderer});
 const loader=createVocabularyDiagramLoader(importModule);
 await expect(loader.load()).rejects.toThrow('Network interrupted');expect(loader.peek()).toBeUndefined();
 expect(await loader.load()).toBe(Renderer);expect(importModule).toHaveBeenCalledTimes(2);
});

test('a browser-cached download failure retries the same local chunk with a fresh URL',async()=>{
 const Renderer=()=>null,url=new URL('/assets/VocabularyMeaningDiagram-content123.js',window.location.origin).href;
 const importer=vi.fn().mockRejectedValue(new TypeError('Failed to fetch dynamically imported module: '+url));
 const retry=vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: '+url)).mockResolvedValueOnce({VocabularyMeaningDiagram:Renderer});
 const loader=createVocabularyDiagramLoader(importer,retry);
 await expect(loader.load()).rejects.toThrow('Failed to fetch');expect(retry).not.toHaveBeenCalled();
 await expect(loader.load()).rejects.toThrow('Failed to fetch');expect(retry).toHaveBeenNthCalledWith(1,url+'?diagramRetry=1');
 expect(await loader.load()).toBe(Renderer);expect(retry).toHaveBeenNthCalledWith(2,url+'?diagramRetry=2');expect(importer).toHaveBeenCalledTimes(1);
 expect(await loader.load()).toBe(Renderer);expect(retry).toHaveBeenCalledTimes(2);
});

test('an error cannot redirect a retry to another origin or a different module',async()=>{
 for(const url of ['https://example.test/assets/VocabularyMeaningDiagram-123.js',new URL('/assets/PlanningPage-123.js',window.location.origin).href]){
  const importer=vi.fn().mockRejectedValue(new TypeError('Failed to fetch dynamically imported module: '+url)),retry=vi.fn();const loader=createVocabularyDiagramLoader(importer,retry);
  await expect(loader.load()).rejects.toThrow();await expect(loader.load()).rejects.toThrow();expect(retry).not.toHaveBeenCalled();expect(importer).toHaveBeenCalledTimes(2);
 }
});

test('the initial page recovery explicitly defers a locally handled diagram failure',async()=>{
 sessionStorage.clear();const reload=vi.fn(),stop=installPageLoadRecovery(reload);
 const importer=async()=>{
  const own=new Event('vite:preloadError',{cancelable:true});Object.assign(own,{payload:new TypeError('Failed to fetch dynamically imported module: /assets/VocabularyMeaningDiagram-123.js')});window.dispatchEvent(own);
  throw new TypeError('Diagram request failed');
 };
 try{await expect(createVocabularyDiagramLoader(importer).load()).rejects.toThrow('Diagram request failed');expect(reload).not.toHaveBeenCalled();
  const later=new Event('vite:preloadError',{cancelable:true});Object.assign(later,{payload:new TypeError('Failed to fetch dynamically imported module: /assets/VocabularyMeaningDiagram-123.js')});window.dispatchEvent(later);expect(reload).toHaveBeenCalledOnce();
 }finally{stop();sessionStorage.clear();}
});

test('an unrelated page download still receives recovery while a diagram is loading',async()=>{
 sessionStorage.clear();const reload=vi.fn(),stop=installPageLoadRecovery(reload);
 const importer=async()=>{
  const other=new Event('vite:preloadError',{cancelable:true});Object.assign(other,{payload:new TypeError('Failed to fetch dynamically imported module: /assets/PlanningPage-123.js')});window.dispatchEvent(other);
  throw new TypeError('Diagram request failed');
 };
 try{await expect(createVocabularyDiagramLoader(importer).load()).rejects.toThrow('Diagram request failed');expect(reload).toHaveBeenCalledOnce();}finally{stop();sessionStorage.clear();}
});
