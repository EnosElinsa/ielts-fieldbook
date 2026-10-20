import { useCallback, useEffect, useRef, useState } from 'react';
import { vocabularySessionDrafts, type StoredVocabularyDraft } from '../../storage/vocabularySessionDrafts';
import type { VocabularyPracticeSession } from '../../domain/vocabulary/session';

export function useVocabularyLocalDrafts(owner:string|null){
  const [drafts,setDrafts]=useState<StoredVocabularyDraft[]>([]),[ready,setReady]=useState(false),[error,setError]=useState('');
  const current=useRef(owner),revisions=useRef(new Map<string,number>()),queue=useRef<Promise<unknown>>(Promise.resolve());
  current.current=owner;
  const reload=useCallback(async()=>{
    if(!owner){setDrafts([]);setReady(true);return;}
    try{await queue.current.catch(()=>{});if(current.current!==owner)return;await vocabularySessionDrafts.migrate(owner);const rows=await vocabularySessionDrafts.list(owner);if(current.current!==owner)return;revisions.current=new Map(rows.map(row=>[row.session.id,row.revision]));setDrafts(rows);setError('');return rows;}
    catch(cause){if(current.current===owner)setError(cause instanceof Error?cause.message:'Local session storage is unavailable.');}
    finally{if(current.current===owner)setReady(true);}
  },[owner]);
  useEffect(()=>{setReady(false);setDrafts([]);setError('');revisions.current.clear();void reload();},[reload]);
  const save=useCallback((session:VocabularyPracticeSession):Promise<boolean>=>{
    const operation=queue.current.catch(()=>{}).then(async()=>{
      if(!owner||current.current!==owner)return false;
      try{const row=await vocabularySessionDrafts.save(owner,session,revisions.current.get(session.id)||0);if(current.current!==owner)return false;revisions.current.set(session.id,row.revision);setDrafts(rows=>[row,...rows.filter(value=>value.session.id!==session.id)]);setError('');return true;}
      catch(cause){if(current.current===owner)setError(cause instanceof Error?cause.message:'Could not save this local session.');return false;}
    });queue.current=operation;return operation;
  },[owner]);
  const remove=useCallback((id:string):Promise<boolean>=>{
    const operation=queue.current.catch(()=>{}).then(async()=>{
      if(!owner||current.current!==owner)return false;
      try{await vocabularySessionDrafts.remove(owner,id,revisions.current.get(id)||0);if(current.current!==owner)return false;revisions.current.delete(id);setDrafts(rows=>rows.filter(row=>row.session.id!==id));return true;}
      catch(cause){if(current.current===owner)setError(cause instanceof Error?cause.message:'Could not discard this local session.');return false;}
    });queue.current=operation;return operation;
  },[owner]);
  return {drafts,ready,error,save,remove,reload,flush:()=>queue.current};
}
