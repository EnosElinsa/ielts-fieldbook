// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { buildUnitPracticeQueue } from '../../domain/vocabulary/selection';
import { vocabularyGroupProgress } from '../../domain/vocabulary/progress';
import { VOCABULARY_CATALOG } from '../../domain/vocabulary/catalog';
import '../../styles/vocabulary-workbench.css';

export function VocabularyGroupPicker({ state, bookId, currentUnitId, onSelect, onClose }) {
  const dialog = useRef(null);
  const [search, setSearch] = useState('');
  const [chapterId, setChapterId] = useState(() => VOCABULARY_CATALOG.units.find(unit => unit.bookId === bookId && unit.id === currentUnitId)?.parentId || '');
  const book = VOCABULARY_CATALOG.books.find(book => book.id === bookId);
  const units = VOCABULARY_CATALOG.units.filter(unit => unit.bookId === bookId).slice().sort((a,b) => (a.order || 0) - (b.order || 0));
  const chapters = units.filter(unit => unit.kind === 'chapter' || units.some(child => child.parentId === unit.id));
  const groups = units.filter(unit => unit.kind !== 'chapter' && !units.some(child => child.parentId === unit.id));
  const within = (group, id) => { let current = group; const seen = new Set(); while (current && !seen.has(current.id)) { if (current.id === id) return true; seen.add(current.id); current = units.find(unit => unit.id === current.parentId); } return false; };
  const path = group => { const titles = [group.title]; let parent = group.parentId; const seen = new Set(); while (parent && !seen.has(parent)) { seen.add(parent); const unit = units.find(unit => unit.id === parent); if (!unit) break; titles.unshift(unit.title); parent = unit.parentId; } return [book?.title, ...titles].filter(Boolean).join(' / '); };
  useEffect(() => { const previous = document.activeElement; dialog.current?.showModal?.(); return () => previous?.focus?.(); }, []);
  const shown = groups.filter(group => (search.trim() || !chapterId || chapterId === '*' || within(group, chapterId)) && path(group).toLowerCase().includes(search.toLowerCase().trim()));
  return <dialog className="vocabulary-group-picker" ref={dialog} aria-labelledby="group-picker-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><h2 id="group-picker-title">Choose a group</h2><p>{book?.title}</p></div><button className="btn line" type="button" onClick={onClose}>Close</button></header>
    <label className="vocabulary-picker-search">Search chapters and groups<input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Search groups" /></label>
    <div className={`vocabulary-picker-columns${chapterId || search.trim() ? ' has-chapter' : ''}`}><nav aria-label="Wordbook chapters"><button className="btn line" type="button" aria-pressed={!chapterId || chapterId === '*'} onClick={() => setChapterId('*')}>All chapters</button>{chapters.map(chapter => <button className="btn line" type="button" key={chapter.id} aria-pressed={chapterId === chapter.id} onClick={() => setChapterId(chapter.id)}>{chapter.title}</button>)}</nav>
    <section aria-label="Study groups"><button className="btn text vocabulary-picker-back" type="button" onClick={() => setChapterId('')}>Back to chapters</button>{shown.map(group => {
      const ids = [...new Set([...VOCABULARY_CATALOG.memberships.filter(item => item.bookId === bookId && item.unitId === group.id).map(item => item.entryId), ...(group.entryIds || [])])];
      const active = ids.filter(id => !(state.vocabulary || []).find(entry => entry.id === id)?.tags?.includes('archived'));
      const status = vocabularyGroupProgress(state, { ...group, studyEntryIds: active });
      return <button type="button" className="vocabulary-picker-group" key={group.id} aria-current={currentUnitId === group.id ? 'true' : undefined} disabled={!active.length} onClick={() => { onSelect(group.id); onClose(); }}><strong>{group.title}{currentUnitId === group.id ? ' · Current group' : ''}</strong><small>{path(group)}</small><span>{status} · {active.length}{group.totalSourceWords ? `/${group.totalSourceWords}` : ''} words available</span><small>{['dictation','cloze','synonym','distinction'].map(mode => `${mode}: ${buildUnitPracticeQueue(state, bookId, group.id, mode).eligibleWords}/${active.length}`).join(' · ')}</small></button>;
    })}{!shown.length ? <p>No groups match your search.</p> : null}</section></div>
  </dialog>;
}
