import type { VocabularyPracticeSession } from '../domain/vocabulary/session';
import { validateVocabularyDraft, readVocabularyDraft, clearVocabularyDraft } from './vocabularyDrafts';
export type StoredVocabularyDraft={owner:string;session:VocabularyPracticeSession;revision:number;savedAt:string};
type Row=StoredVocabularyDraft&{key:string};
const identity=(owner:string,id:string)=>JSON.stringify([owner,id]);
const validOwner=(owner:string)=>{if(!owner?.trim()||owner.length>500)throw new Error('Invalid draft account.');};
export function createVocabularyDraftStore(factory?:IDBFactory,name='fieldbook-vocabulary-sessions-v2'){
  let opened:Promise<IDBDatabase>|undefined;
  let usedFactory:IDBFactory|undefined;
  function database(){
    const provider=factory||globalThis.indexedDB;
    if(usedFactory!==provider){void opened?.then(db=>db.close(),()=>{});opened=undefined;usedFactory=provider;}
    if(!opened)opened=new Promise<IDBDatabase>((resolve,reject)=>{
      if(!provider){reject(new Error('Local draft storage is unavailable.'));return;}
      const request=provider.open(name,1);
      request.onupgradeneeded=()=>{const store=request.result.createObjectStore('drafts',{keyPath:'key'});store.createIndex('owner','owner');};
      request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();opened=undefined;};resolve(request.result);};
      request.onerror=()=>reject(request.error||new Error('Local draft storage is unavailable.'));
      request.onblocked=()=>reject(new Error('Close older tabs before updating local draft storage.'));
    }).catch(error=>{opened=undefined;throw error;});
    return opened;
  }
  const store={
    async list(owner:string):Promise<StoredVocabularyDraft[]>{
      validOwner(owner);const db=await database();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('drafts','readonly'),request=tx.objectStore('drafts').index('owner').getAll(owner);
        tx.oncomplete=()=>resolve((request.result as Row[]).filter(row=>row.owner===owner&&validateVocabularyDraft(row.session)).map(({key:_,...row})=>row).sort((a,b)=>b.savedAt.localeCompare(a.savedAt)||a.session.id.localeCompare(b.session.id)));
        tx.onerror=()=>reject(tx.error||new Error('Could not read local sessions.'));
        tx.onabort=()=>reject(tx.error||new Error('Could not read local sessions.'));
      });
    },
    async save(owner:string,session:VocabularyPracticeSession,expectedRevision=0):Promise<StoredVocabularyDraft>{
      validOwner(owner);const safe=validateVocabularyDraft(session);if(!safe||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('Invalid vocabulary draft.');
      const db=await database();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('drafts','readwrite'),drafts=tx.objectStore('drafts'),key=identity(owner,safe.id),request=drafts.get(key);
        let failure:Error|undefined,result:StoredVocabularyDraft;
        request.onsuccess=()=>{
          const current=request.result as Row|undefined;
          if((current?.revision||0)!==expectedRevision){failure=new Error('This session changed in another tab. Reload its saved draft before continuing.');tx.abort();return;}
          result={owner,session:safe,revision:expectedRevision+1,savedAt:new Date().toISOString()};drafts.put({...result,key});
        };
        tx.oncomplete=()=>resolve(result);
        tx.onabort=tx.onerror=()=>reject(failure||tx.error||new Error('Could not save this local session.'));
      });
    },
    async remove(owner:string,id:string,expectedRevision:number):Promise<void>{
      validOwner(owner);const db=await database();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('drafts','readwrite'),drafts=tx.objectStore('drafts'),key=identity(owner,id),request=drafts.get(key);let failure:Error|undefined;
        request.onsuccess=()=>{const current=request.result as Row|undefined;if(!current)return;if(current.revision!==expectedRevision){failure=new Error('This session changed in another tab. Reload before discarding it.');tx.abort();return;}drafts.delete(key);};
        tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(failure||tx.error||new Error('Could not remove this local session.'));
      });
    },
    async migrate(owner:string):Promise<void>{
      const legacy=readVocabularyDraft(owner);if(!legacy)return;
      const current=(await store.list(owner)).find(row=>row.session.id===legacy.id);
      if(current&&JSON.stringify(current.session)!==JSON.stringify(legacy))throw new Error('The legacy session differs from its saved draft. Keep both until it is resolved.');
      if(!current)await store.save(owner,legacy);
      const verified=(await store.list(owner)).find(row=>row.session.id===legacy.id);
      if(!verified||JSON.stringify(verified.session)!==JSON.stringify(legacy))throw new Error('The migrated session could not be verified.');
      if(JSON.stringify(readVocabularyDraft(owner))===JSON.stringify(legacy))clearVocabularyDraft(owner);
    },
  };
  return store;
}
export const vocabularySessionDrafts=createVocabularyDraftStore();
