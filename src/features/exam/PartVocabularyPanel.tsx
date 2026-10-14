import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFieldbook } from '../../context/FieldbookContext';
import { accountId } from '../../storage/remote';
import type { ExamAttempt, ExamCatalog } from '../../domain/exam/types';
import type { VocabularyEntry, VocabularySense } from '../../domain/vocabulary';
import { examVocabularySourceUrl, partVocabularyReviewUrl } from '../../domain/vocabulary/sources';
import { loadDictionaryIndex, loadTermDictionary, resetDictionaryCache, type DictionaryIndex } from '../vocabulary/dictionary';
import { VocabularySenseContent } from '../vocabulary/VocabularySenseContent';
import { StateMessage, InlineLoadingState } from '../../components/AsyncState';
import { buildPartVocabularyCandidates } from './partVocabulary';
import '../../styles/part-vocabulary.css';

export function PartVocabularyPanel({ catalog, attempt, sectionId }: { catalog: ExamCatalog; attempt: ExamAttempt; sectionId: string }) {
  const fb = useFieldbook();
  const owner = accountId();
  const identity = `${owner}:${attempt.id}:${sectionId}`;
  const live = useRef(identity); live.current = identity;
  const mounted = useRef(true);
  const lock = useRef(false);
  const generation = useRef(0);
  const termGeneration = useRef(new Map<string, number>());
  const [tab, setTab] = useState<'saved' | 'candidates'>('saved');
  const [index, setIndex] = useState<DictionaryIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [meanings, setMeanings] = useState<Record<string, VocabularySense[]>>({});
  const [termLoading, setTermLoading] = useState<Record<string, boolean>>({});
  const [termErrors, setTermErrors] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [limit, setLimit] = useState(30);
  const [savedRevision, setSavedRevision] = useState(0);
  const available = attempt.status === 'completed' && attempt.sectionIds.includes(sectionId);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => {
    generation.current++; termGeneration.current.clear(); lock.current = false; setTab('saved'); setIndex(null); setLoading(false); setError(''); setStatus('');
    setSaving(false); setMeanings({}); setTermLoading({}); setTermErrors({}); setChosen({}); setLimit(30);
  }, [identity]);
  useEffect(() => {
    if (tab !== 'candidates' || !available) return;
    let active = true; setLoading(true); setError('');
    loadDictionaryIndex().then(value => { if (active) setIndex(value); }).catch(() => { if (active) setError('Vocabulary candidates could not be loaded. Retry when the connection is available.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tab, identity, revision, available]);
  const candidates = useMemo(() => index ? buildPartVocabularyCandidates(catalog, attempt, sectionId, index) : [], [index, catalog, attempt, sectionId]);
  const saved = useMemo(() => ((fb.stateRef.current.vocabulary || []) as VocabularyEntry[]).filter(entry => !entry.tags.includes('archived') && entry.sources.some(source => source.type === attempt.skill && source.id === sectionId)), [fb.state, sectionId, attempt.skill, savedRevision]);
  const selectedCount = Object.values(chosen).reduce((count, ids) => count + ids.length, 0);
  const current = (requested: string, version: number) => mounted.current && live.current === requested && accountId() === owner && generation.current === version;
  async function loadMeanings(term: string) {
    const requested = identity; const version = generation.current;
    const termVersion = (termGeneration.current.get(term) || 0) + 1;
    termGeneration.current.set(term, termVersion);
    const active = () => current(requested, version) && termGeneration.current.get(term) === termVersion;
    setTermLoading(value => ({ ...value, [term]: true })); setTermErrors(value => ({ ...value, [term]: '' }));
    try {
      const data = await loadTermDictionary(term);
      if (active()) setMeanings(value => ({ ...value, [term]: data }));
    } catch { if (active()) setTermErrors(value => ({ ...value, [term]: 'Meanings could not be loaded. Retry this word.' })); }
    finally { if (active()) setTermLoading(value => ({ ...value, [term]: false })); }
  }
  async function saveSelected() {
    if (lock.current || !available || !selectedCount || accountId() !== owner) return;
    lock.current = true;
    const requested = identity; const version = generation.current;
    const batch = candidates.flatMap(candidate => {
      const senses = (meanings[candidate.term] || []).filter(sense => chosen[candidate.term]?.includes(sense.id));
      return senses.length ? [{ candidate, senses }] : [];
    });
    setSaving(true); setError(''); setStatus('');
    let count = 0;
    try {
      for (const { candidate, senses } of batch) {
        if (!current(requested, version)) return;
        const input = { term: candidate.term, senses, sources: senses.flatMap(sense => candidate.sources.map(source => ({ ...source, senseId: sense.id }))) };
        const ok = await fb.saveVocabularyEntry(input);
        if (!current(requested, version)) return;
        if (!ok) throw new Error('save');
        count++; setChosen(value => { const next = { ...value }; delete next[candidate.term]; return next; }); setSavedRevision(value => value + 1);
      }
      if (current(requested, version)) setStatus(`${count} ${count === 1 ? 'word' : 'words'} saved.`);
    } catch { if (current(requested, version)) setError(`${count ? `${count} ${count === 1 ? 'word was' : 'words were'} saved. ` : ''}Selected meanings could not be saved. Your remaining selections are kept; retry saving.`); }
    finally { if (current(requested, version)) { lock.current = false; setSaving(false); } }
  }
  if (!available) return null;
  return <section className="part-vocabulary" aria-label="Part vocabulary">
    <header><div><span className="exam-eyebrow">Source learning</span><h3>Part vocabulary</h3></div><div className="exam-part-tabs" role="group" aria-label="Part vocabulary views">
      <button type="button" aria-pressed={tab === 'saved'} className={tab === 'saved' ? 'active' : ''} onClick={() => setTab('saved')}>Saved ({saved.length})</button>
      <button type="button" aria-pressed={tab === 'candidates'} className={tab === 'candidates' ? 'active' : ''} onClick={() => setTab('candidates')}>Vocabulary candidates</button>
    </div></header>
    {error && <StateMessage kind="error" message={error} onRetry={!index ? () => { resetDictionaryCache(); setRevision(value => value + 1); } : undefined} />}
    {status && <p role="status">{status}</p>}
    {tab === 'saved' ? <>
      {saved.length ? <><Link className="btn line" to={partVocabularyReviewUrl(attempt.skill, sectionId)}>Review this Part vocabulary</Link><ul className="part-vocabulary-saved">{saved.map(entry => {
        const sources = entry.sources.filter(source => source.type === attempt.skill && source.id === sectionId);
        const senseIds = new Set(sources.map(source => source.senseId));
        return <li key={entry.id}><div><Link to={`/vocabulary/entry/${encodeURIComponent(entry.id)}`}>{entry.term}</Link>{entry.senses.filter(sense => senseIds.has(undefined) || senseIds.has(sense.id)).map(sense => <p key={sense.id}>{sense.definition}</p>)}</div><div>{sources.map((source, i) => { const url = examVocabularySourceUrl(source); return url ? <Link key={i} to={url}>Original source{sources.length > 1 ? ` ${i + 1}` : ''}</Link> : null; })}</div></li>;
      })}</ul></> : <p>No vocabulary saved from this Part yet. Explore candidates and choose the meanings you want to collect.</p>}
    </> : <>
      <p>Matched locally against the existing dictionary. Choose the meanings that fit this source before saving. Collection does not count as a review.</p>
      {loading && <InlineLoadingState message="Finding vocabulary candidates…" onRetry={() => { resetDictionaryCache(); setRevision(value => value + 1); }} />}
      {!loading && index && !candidates.length && <p>No dictionary candidates were found in this Part.</p>}
      {candidates.slice(0, limit).map(candidate => <article className="part-vocabulary-candidate" key={candidate.term}>
        <div className="part-vocabulary-candidate-head"><div><h4>{candidate.term}</h4><small>{candidate.reasons.join(' · ')} · {candidate.sources.length} source {candidate.sources.length === 1 ? 'occurrence' : 'occurrences'}</small></div><button className="btn line" type="button" disabled={saving || !!termLoading[candidate.term]} onClick={() => void loadMeanings(candidate.term)}>Choose meanings for {candidate.term}</button></div>
        <blockquote>{candidate.sources[0]?.context}</blockquote>
        {termLoading[candidate.term] && <InlineLoadingState message={`Loading meanings for ${candidate.term}…`} retryLabel="Retry meanings" onRetry={() => { resetDictionaryCache(); void loadMeanings(candidate.term); }} />}
        {termErrors[candidate.term] && <StateMessage kind="error" message={termErrors[candidate.term]} onRetry={() => void loadMeanings(candidate.term)} />}
        {meanings[candidate.term]?.length === 0 && <p>No dictionary meanings are available for this word.</p>}
        {meanings[candidate.term]?.map(sense => <div className="part-vocabulary-meaning" key={sense.id}><label><input type="checkbox" disabled={saving} checked={chosen[candidate.term]?.includes(sense.id) || false} onChange={event => setChosen(value => ({ ...value, [candidate.term]: event.target.checked ? [...(value[candidate.term] || []), sense.id] : (value[candidate.term] || []).filter(id => id !== sense.id) }))} /><span>{sense.pos} · {sense.definition}</span></label><VocabularySenseContent sense={sense} /></div>)}
      </article>)}
      {candidates.length > limit && <button className="btn line" type="button" onClick={() => setLimit(value => value + 30)}>Show more candidates ({candidates.length - limit} remaining)</button>}
      {index && <div className="part-vocabulary-save"><button className="btn primary" type="button" disabled={saving || !selectedCount} onClick={() => void saveSelected()}>{saving ? 'Saving selected meanings…' : `Save selected meanings (${selectedCount})`}</button></div>}
    </>}
  </section>;
}
