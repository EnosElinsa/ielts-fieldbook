import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { ModalFrame } from '../../components/ModalFrame';
import { useFieldbook } from '../../context/FieldbookContext';
import { accountId } from '../../storage/remote';
import type { VocabularyEntry, VocabularySource } from '../../domain/vocabulary';
import { lookupVocabularyCapture, type VocabularyCaptureLookup } from './vocabularyCaptureLookup';
import { Pronunciation } from './Pronunciation';
import './vocabulary-collection.css';

type Seed = Omit<Partial<VocabularyEntry>, 'tags'> & { tags?: string[] | string; skill?: string; context?: string; sourceId?: string; sourceType?: string; source?: string };
const blankForm = { meaning: '', example: '', pos: '', tags: '', collocations: '', usage: '', synonyms: '', antonyms: '' };
const split = (value: string) => value.split(';').map(row => row.trim()).filter(Boolean);

export function VocabularyCollectionDialog({ open, seed }: { open: boolean; seed?: Seed | null }) {
  const fb = useFieldbook() as any;
  const formId = useId();
  const owner = accountId();
  const [term, setTerm] = useState('');
  const [form, setForm] = useState(blankForm);
  const [category, setCategory] = useState<VocabularyEntry['category']>('word');
  const [skill, setSkill] = useState('');
  const [lookup, setLookup] = useState<VocabularyCaptureLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [selected, setSelected] = useState('');
  const [personal, setPersonal] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const lock = useRef(false);
  const generation = useRef(0);
  const openedFor = useRef(owner);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => {
    generation.current++; openedFor.current = owner; lock.current = false;
    if (!open) return;
    const first = seed?.senses?.[0];
    setTerm(seed?.term || ''); setCategory(seed?.category || 'word'); setSkill(seed?.skill || seed?.sources?.find(source => source.skill)?.skill || '');
    setForm({ ...blankForm, meaning: first?.definition || seed?.meaning || '', example: first?.example || seed?.example || seed?.context || '', pos: first?.pos || '', tags: Array.isArray(seed?.tags) ? seed.tags.join('; ') : seed?.tags || '' });
    setPersonal(Boolean(first?.definition || seed?.meaning)); setSelected(''); setLookup(null); setRetry(0); setAccountReady(false); setSaving(false); setError(''); setLoadError('');
  }, [open, owner, seed]);
  useEffect(() => {
    if (!open || !term.trim()) { setLoading(false); return; }
    let active = true;
    setLoading(true); setAccountReady(false); setLoadError('');
    const timer = setTimeout(() => {
      void (async () => {
        try {
          await fb.ensureAccountModule('vocabulary');
          if (!active || accountId() !== owner) return;
          setAccountReady(true);
          const result = await lookupVocabularyCapture(term, fb.stateRef.current.vocabulary || [], { force: retry > 0 });
          if (active && accountId() === owner) setLookup(result);
        } catch {
          if (active && accountId() === owner) setLoadError('Your vocabulary could not be loaded. Retry before saving to avoid duplicate words.');
        } finally { if (active && accountId() === owner) setLoading(false); }
      })();
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [open, term, retry, owner, fb.ensureAccountModule]);
  const changeTerm = (value: string) => { setTerm(value); setSelected(''); setLookup(null); setError(''); };
  const match = lookup?.matches.find(row => row.key === selected);
  const originalQuotes = [...new Set((seed?.sources || []).flatMap(source => source.exam?.quote ? [source.exam.quote] : []))];
  const sourceContext = seed?.context || seed?.sources?.find(source => source.context)?.context || seed?.example;
  const change = (field: keyof typeof blankForm, value: string) => setForm(current => ({ ...current, [field]: value }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current || saving || loading || !accountReady || !term.trim() || !personal && !match || accountId() !== openedFor.current) return;
    lock.current = true; setSaving(true); setError('');
    const version = generation.current, saveOwner = openedFor.current;
    const sources: VocabularySource[] = seed?.sources?.length ? seed.sources : [{ type: (seed?.sourceType || skill || 'personal') as VocabularySource['type'], id: seed?.sourceId || seed?.source || 'manual', ...(skill ? { skill: skill as VocabularySource['skill'] } : {}), ...(sourceContext ? { context: sourceContext } : {}) }];
    const targetEntry = personal ? lookup?.entries[0] : match?.entry;
    const sense = personal ? { id: '', definition: form.meaning.trim(), example: form.example.trim(), pos: form.pos.trim() || 'expression',
      collocations: split(form.collocations), usage: form.usage.trim(), synonyms: split(form.synonyms), antonyms: split(form.antonyms), source: 'Personal note' } : match!.sense;
    let feedback = '';
    try {
      const ok = await fb.collectVocabularyEntry({ term: term.trim(), entry: targetEntry, ...(personal ? { category } : {}),
        sense, sources, ...(personal ? { tags: split(form.tags) } : {}) }, { onError: (message: string) => { feedback = message; } });
      if (!mounted.current || generation.current !== version || accountId() !== saveOwner) return;
      if (ok) { fb.setVocabularySeed(null); fb.setEditingVocabularyId(null); fb.closeModal(); fb.toast('Saved to My words.'); }
      else setError(`${feedback || 'Vocabulary could not be saved.'} Your selections and edits are kept; retry saving.`);
    } catch {
      if (mounted.current && generation.current === version && accountId() === saveOwner) setError('Vocabulary could not be saved. Your selections and edits are kept; retry saving.');
    } finally {
      if (mounted.current && generation.current === version && accountId() === saveOwner) { lock.current = false; setSaving(false); }
    }
  };
  return <ModalFrame open={open} busy={saving} title="Add vocabulary" size="md" onClose={() => fb.closeModal()}
    description="Save to My words. Collecting does not mark a word as learned or start a review schedule."
    footer={<>
      {error && <p role="alert" className="vocabulary-collection-error">{error}</p>}
      <button className="btn line" type="button" disabled={saving} onClick={() => fb.closeModal()}>Cancel</button>
      <button className="btn primary" form={formId} type="submit" disabled={saving || loading || !accountReady || !term.trim() || !personal && !match}><Save size={16} />{saving ? 'Saving…' : 'Save to My words'}</button>
    </>}>
    <form id={formId} className="vocabulary-collection" onSubmit={event => void save(event)}>
      {originalQuotes.length > 0 && <div className="vocabulary-capture-context"><strong>Original selection</strong><blockquote>{originalQuotes.join(' · ')}</blockquote><p>The original wording and source link are kept when you choose a dictionary form.</p></div>}
      <fieldset disabled={saving} className="vocabulary-collection-fields">
        <label>Word / phrase / pattern<input value={term} onChange={event => changeTerm(event.target.value)} required autoComplete="off" /></label>
        {sourceContext && <details className="vocabulary-collection-source"><summary>Source sentence</summary><blockquote>{sourceContext}</blockquote></details>}
        {loading && <p role="status">Looking up saved words and dictionary meanings…</p>}
        {loadError && <p role="alert">{loadError}</p>}
        {(loadError || lookup?.unavailable) && <div className="vocabulary-collection-warning">{!loadError && <p>Some vocabulary sources could not be checked. You can use an available meaning or add a personal meaning.</p>}<button className="btn line" type="button" onClick={() => setRetry(value => value + 1)}>Retry lookup</button></div>}
        {!!lookup?.suggestions.length && <div className="vocabulary-collection-suggestions"><span>Possible dictionary forms</span>{lookup.suggestions.map(value => <button className="btn line" type="button" key={value} onClick={() => { changeTerm(value); setPersonal(false); }}>Use {value}</button>)}</div>}
        {!!lookup?.matches.length && <fieldset className="vocabulary-collection-matches"><legend>Choose the meaning used here</legend>{lookup.matches.map(row => <label className={`vocabulary-collection-match${!personal && selected === row.key ? ' is-selected' : ''}`} key={row.key}>
          <input type="radio" name="collected-meaning" checked={!personal && selected === row.key} onChange={() => { setSelected(row.key); setPersonal(false); }} />
          <span><small>{row.saved ? 'Already in My words' : 'Dictionary meaning'} · {row.sense.pos}</small><strong>{row.sense.definition}</strong>{row.sense.example && <span>{row.sense.example}</span>}</span>
        </label>)}</fieldset>}
        {!loading && lookup && !lookup.matches.length && !lookup.unavailable && <p>No exact meaning found. Choose a suggested form or add a personal meaning.</p>}
        <button className="btn line" type="button" aria-pressed={personal} onClick={() => { setPersonal(true); setSelected(''); }}>Add a personal meaning</button>
        {!personal && match?.entry && <Pronunciation compact entry={match.entry} sense={match.sense} />}
        {(personal ? lookup?.entries[0] : match?.entry)?.tags.includes('archived') && <p>Collecting restores this archived word to My words.</p>}
        {personal && <div className="vocabulary-collection-personal">
          <label>English definition<textarea rows={2} value={form.meaning} onChange={event => change('meaning', event.target.value)} /></label>
          {!form.meaning.trim() && <p className="vocabulary-collection-pending">Pending definition: you can collect this word now and complete its meaning in My words before practising.</p>}
          <label>Example sentence<textarea rows={3} value={form.example} onChange={event => change('example', event.target.value)} /></label>
          <details><summary>More information</summary><div className="vocabulary-collection-advanced">
            <label>Type<select value={category} onChange={event => setCategory(event.target.value as VocabularyEntry['category'])}>{['word', 'phrase', 'sentence'].map(value => <option key={value} value={value}>{value === 'sentence' ? 'Sentence pattern' : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
            <label>Source skill<select value={skill} disabled={Boolean(seed?.sources?.some(source => source.exam))} onChange={event => setSkill(event.target.value)}><option value="">No skill assigned</option>{['listening', 'reading', 'writing', 'speaking'].map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
            {([['pos', 'Part of speech'], ['tags', 'Tags'], ['collocations', 'Collocations'], ['usage', 'Usage notes'], ['synonyms', 'Synonyms'], ['antonyms', 'Antonyms']] as const).map(([key, label]) => <label key={key}>{label}<input value={form[key]} onChange={event => change(key, event.target.value)} /></label>)}
          </div></details>
        </div>}
      </fieldset>
    </form>
  </ModalFrame>;
}
