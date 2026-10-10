import { useEffect, useState } from 'react';
import { BookOpen, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFieldbook } from '../../context/FieldbookContext';
import { addVocabularyItem, normalizeAnswer } from '../../domain/vocabulary';
import type { VocabularyEntry, VocabularySense } from '../../domain/vocabulary';

type DictionaryFile = { entries: { term: string; senses: VocabularySense[] }[] };
let dictionaryRequest: Promise<DictionaryFile> | null = null;
let dictionaryIndex: Promise<Record<string, string>> | null = null;
async function loadTermDictionary(term: string) {
  if(!dictionaryIndex) dictionaryIndex=fetch('/dictionary/index.json').then(async response=>response.ok?response.json():{}).catch(()=>({}));
  const index=await dictionaryIndex;
  const file=index[normalizeAnswer(term)];
  if(file && /^[a-f0-9]+\.json$/.test(file)) {
    const response = await fetch(`/dictionary/${file}`);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.senses)) return data.senses as VocabularySense[];
    }
  }
  const fallback = await loadDictionary();
  return fallback.entries.find(item=>normalizeAnswer(item.term)===normalizeAnswer(term))?.senses || [];
}
function loadDictionary() {
  if (!dictionaryRequest) dictionaryRequest = fetch('/vocabulary-dictionary.json').then(async response => {
    if (!response.ok) throw new Error('Dictionary is unavailable.');
    return response.json() as Promise<DictionaryFile>;
  }).catch(error => { dictionaryRequest = null; throw error; });
  return dictionaryRequest;
}

export function DictionarySenses({ entry }: { entry: VocabularyEntry }) {
  const fb = useFieldbook(); const navigate = useNavigate();
  const [senses, setSenses] = useState<VocabularySense[]>([]);
  const [error, setError] = useState(''); const [revision, setRevision] = useState(0); const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSenses([]); setError('');
    loadTermDictionary(entry.term).then(data => { if (!cancelled) setSenses(data); }).catch(() => { if (!cancelled) setError('Dictionary could not be loaded.'); });
    return () => { cancelled = true; };
  }, [entry.term, revision]);
  const studySense = async (sense: VocabularySense) => {
    setSaving(sense.id);
    const draft = structuredClone(fb.stateRef.current);
    const result = addVocabularyItem(draft, { term: entry.term, id: entry.id, senses: [sense], sources: [{ type: 'personal', id: `dictionary:${sense.id}`, senseId: sense.id }] });
    try {
      if (result.item && await fb.persistNow(draft)) {
        const savedSense = result.item.senses.find(item => normalizeAnswer(item.definition) === normalizeAnswer(sense.definition));
        navigate(`/vocabulary/review?entryId=${encodeURIComponent(result.item.id)}&senseId=${encodeURIComponent(savedSense?.id || sense.id)}&mode=definition&dueOnly=false`);
      } else setError('This sense could not be saved.');
    } catch { setError('This sense could not be saved.'); } finally { setSaving(null); }
  };
  return <section className="vocabulary-dictionary">
    <h3 className="vocabulary-section-title">English dictionary</h3>
    {error ? <div role="alert" className="vocabulary-error">{error}<button type="button" className="btn line" onClick={() => setRevision(n => n + 1)}><RotateCcw size={15} />Retry</button></div> : null}
    {!senses.length && !error ? <p className="vocabulary-muted">No additional dictionary senses available.</p> : null}
    {senses.map((sense, index) => <section className="vocabulary-sense" key={sense.id}>
      <div className="vocabulary-sense-head"><h4>{index + 1}. {sense.pos}</h4><button type="button" className="btn line" disabled={saving !== null} onClick={() => void studySense(sense)}><BookOpen size={15} />{saving === sense.id ? 'Saving...' : 'Practise this sense'}</button></div>
      <p>{sense.definition}</p>{sense.example ? <blockquote>{sense.example}</blockquote> : null}
      <p className="vocabulary-muted">{[sense.attribution, sense.license].filter(Boolean).join(' | ')}</p>
    </section>)}
  </section>;
}
