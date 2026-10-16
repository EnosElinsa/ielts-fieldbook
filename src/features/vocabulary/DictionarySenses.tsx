import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { InlineLoadingState, StateMessage } from '../../components/AsyncState';
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { vocabularyForwardState } from './VocabularyRouteLink';
import { useFieldbook } from "../../context/FieldbookContext";
import { addVocabularyItem, normalizeAnswer } from "../../domain/vocabulary";
import type { VocabularyEntry, VocabularySense } from "../../domain/vocabulary";
import { accountId } from "../../storage/remote";
import { VocabularySenseContent } from "./VocabularySenseContent";
import { SelectField } from '../../components/SelectField';
import { vocabularySensePresentation } from '../../domain/vocabulary/dictionaryPresentation';
import { isVocabularyMeaningGroup, isVocabularySpellingReference, isVocabularyUsageReference } from '../../domain/vocabulary/readiness';
import { getVocabularySenseDiagram, type VocabularySenseDiagram } from '../../domain/vocabulary/media';
import { VocabularyMeaningDiagram } from './VocabularyMeaningDiagram';
import { practiceUrl } from "./vocabularyNavigation";
import { loadTermDictionary, resetDictionaryCache } from './dictionary';
export { resetDictionaryCache } from './dictionary';
const key = (sense: VocabularySense) =>
  `${normalizeAnswer(sense.pos)}:${normalizeAnswer(sense.definition)}`;
const partOfSpeech = (sense: VocabularySense) => {
  const pos = normalizeAnswer(sense.pos);
  return ({ adj: 'adjective', adv: 'adverb', name: 'proper name' } as Record<string, string>)[pos] || pos || 'other';
};
const label = (value: string) => value.replace(/^./, char => char.toUpperCase());
function DiagramPreview({ diagram, number }: { diagram: VocabularySenseDiagram; number: number | undefined }) {
  const [open, setOpen] = useState(false);
  return <details className="vocabulary-dictionary-diagram" aria-label={`Diagram for meaning ${number}`} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>View diagram</summary>
    {open ? <VocabularyMeaningDiagram diagram={diagram} /> : null}
  </details>;
}
export function DictionarySenses({
  entry,
  excludeSenses = entry.senses,
  onSources,
}: {
  entry: VocabularyEntry;
  excludeSenses?: VocabularySense[];
  onSources?: (senses: VocabularySense[]) => void;
}) {
  const fb = useFieldbook();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [loaded, setLoaded] = useState<VocabularySense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const retryDictionary = () => { resetDictionaryCache(); setRevision(value => value + 1); };
  const [saving, setSaving] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const searchId = useId();
  useEffect(() => {
    setShowAll(false);
    setQuery('');
    setPosFilter('');
  }, [entry.term, entry.id, revision]);
  useEffect(() => {
    let active = true;
    setLoaded([]);
    setError("");
    setLoading(true);
    onSources?.([]);
    loadTermDictionary(entry.term, entry.id)
      .then((data) => {
        if (active) {
          setLoaded(data);
        }
      })
      .catch(() => {
        if (active) setError("Dictionary could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  // Reapply late scoped teaching to the cached raw dictionary, retaining the reader's filters.
  }, [entry.term, entry.id, revision, fb.vocabularyCatalogRevision]);
  const excludeKey = JSON.stringify(
    excludeSenses.map((sense) => [sense.id, key(sense)]).sort(),
  );
  const senses = useMemo(() => {
    const seen = new Set(excludeSenses.map(key));
    const seenIds = new Set(excludeSenses.map((sense) => sense.id));
    return loaded.filter((sense) => {
      if (
        !sense ||
        typeof sense.id !== "string" ||
        typeof sense.definition !== "string" ||
        typeof sense.pos !== "string" ||
        seenIds.has(sense.id) ||
        seen.has(key(sense))
      )
        return false;
      seen.add(key(sense));
      seenIds.add(sense.id);
      return true;
    });
  }, [loaded, excludeKey]);
  useEffect(() => {
    onSources?.(senses);
  }, [senses, onSources]);
  const withNotes = senses.filter(sense => !isVocabularyMeaningGroup(entry.id, sense) && !isVocabularyUsageReference(entry.id, sense) && sense.editorial && sense.collocations?.length && sense.distinctions?.length);
  const scope = !showAll && withNotes.length ? withNotes : senses;
  const words = normalizeAnswer(query).split(' ').filter(Boolean);
  const visible = scope.filter(sense => {
    if (posFilter && partOfSpeech(sense) !== posFilter) return false;
    const content = vocabularySensePresentation(sense);
    const text = normalizeAnswer([content.definition, content.example, content.usage, content.register,
      ...(sense.collocations || []), ...(sense.distinctions || []), ...content.relations.flatMap(row => row.values)].join(' '));
    return words.every(word => text.includes(word));
  });
  const groups = [...new Set(visible.map(partOfSpeech))];
  const parts = [...new Set(senses.map(partOfSpeech))];
  const clearFilters = () => { setQuery(''); setPosFilter(''); };
  // Meaning numbers stay stable when the reader narrows or widens the results.
  const meaningNumbers = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const sense of senses) {
    const pos = partOfSpeech(sense), number = (counts.get(pos) || 0) + 1;
    counts.set(pos, number); meaningNumbers.set(sense.id, number);
  }
  const saveLock = useRef(false);
  const routeKey = `${entry.id}:${location.pathname}:${location.search}`;
  const routeRef = useRef(routeKey);
  routeRef.current = routeKey;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setSaving(null);
  }, [routeKey]);
  const studySense = async (sense: VocabularySense) => {
    if (saveLock.current) return;
    saveLock.current = true;
    const owner = accountId();
    const requestedRoute = routeRef.current;
    const active = () =>
      mounted.current &&
      owner === accountId() &&
      requestedRoute === routeRef.current;
    setSaving(sense.id);
    setError("");
    try {
      const draft = structuredClone(fb.stateRef.current);
      const result = addVocabularyItem(draft, {
        ...entry,
        senses: [sense],
        sources: [
          ...(entry.sources || []),
          { type: "personal", id: `dictionary:${sense.id}`, senseId: sense.id },
        ],
      });
      let feedback = '';
      const options = { onError: (message: string) => { feedback = message; } };
      const saved =
        result.item &&
        (fb.saveVocabularyEntry
          ? await fb.saveVocabularyEntry({
              ...entry,
              senses: [sense],
              sources: [
                ...entry.sources,
                {
                  type: "personal",
                  id: `dictionary:${sense.id}`,
                  senseId: sense.id,
                },
              ],
            }, options)
          : await fb.persistNow(draft, { ...options, collections: ['vocabulary', 'vocabularyStates'] }));
      if (!active()) return;
      if (result.item && saved) {
        const savedSense = result.item.senses.find(
          (item) => key(item) === key(sense),
        );
        navigate(
          practiceUrl(
            result.item.id,
            savedSense?.id || sense.id,
            {
              bookId: params.get("bookId") || undefined,
              unitId: params.get("unitId") || undefined,
            },
            location.pathname + location.search,
            "definition",
          ),
          {state: vocabularyForwardState(location)},
        );
      } else setError(feedback || "This sense could not be saved. Try again.");
    } catch {
      if (active()) setError("This sense could not be saved. Try again.");
    } finally {
      saveLock.current = false;
      if (active()) setSaving(null);
    }
  };
  return (
    <details className="vocabulary-secondary vocabulary-dictionary">
      <summary>
        Other dictionary meanings{!loading ? ` (${senses.length})` : ""}
      </summary>
      <p className="vocabulary-muted">
        Dictionary meanings beyond the selected learning meanings. Choose a
        meaning to practise it separately.
      </p>
      {withNotes.length ? <div className="vocabulary-dictionary-filter" role="group" aria-label="Dictionary meaning filter">
        <button type="button" className="btn line" aria-pressed={!showAll} onClick={() => setShowAll(false)}>With learning notes ({withNotes.length})</button>
        <button type="button" className="btn line" aria-pressed={showAll} onClick={() => setShowAll(true)}>All meanings ({senses.length})</button>
      </div> : null}
      {!loading && !error && senses.length ? <>
        <div className="vocabulary-dictionary-controls">
          <label htmlFor={searchId}>Find a meaning
            <input id={searchId} className="search" type="search" aria-label="Search dictionary meanings" placeholder="Definition, example or phrase" value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <label>Part of speech
            <SelectField aria-label="Dictionary part of speech" value={posFilter} onValueChange={setPosFilter} options={[{ value: '', label: 'All parts of speech' }, ...parts.map(pos => ({ value: pos, label: label(pos) }))]} />
          </label>
        </div>
        <div className="vocabulary-dictionary-results">
          <p className="vocabulary-muted" role="status" aria-live="polite" aria-atomic="true">{visible.length} of {scope.length} meanings</p>
          {query || posFilter ? <button type="button" className="btn line" onClick={clearFilters}>Clear filters</button> : null}
        </div>
        {!visible.length ? <p className="vocabulary-muted">No meanings match your filters. <span>Try different words{!showAll && withNotes.length ? ' or choose All meanings' : ''}.</span></p> : null}
      </> : null}
      {loading ? (
        <InlineLoadingState message="Loading dictionary meanings…" onRetry={saving === null ? retryDictionary : undefined} retryLabel="Retry dictionary" />
      ) : null}
      {error ? (
        <StateMessage kind="error" message={error} onRetry={retryDictionary} retryLabel="Retry dictionary" retryDisabled={saving !== null} />
      ) : null}
      {!loading && !senses.length && !error ? (
        <StateMessage message="No additional dictionary senses available." />
      ) : null}
      {groups.map((pos) => (
        <section className="vocabulary-dictionary-pos" key={pos}>
          <h3>{label(pos)}</h3>
          {visible
            .filter(
              (sense) => partOfSpeech(sense) === pos,
            )
            .map((sense) => {
              const diagram = getVocabularySenseDiagram({ entry, sense });
              return (
              <section className="vocabulary-sense" key={sense.id}>
                <div className="vocabulary-sense-head">
                  <h4>Meaning {meaningNumbers.get(sense.id)}</h4>
                  {isVocabularyMeaningGroup(entry.id, sense) ? <span className="pill">Meaning group</span> : isVocabularyUsageReference(entry.id, sense) ? <span className="pill">Usage reference</span> : isVocabularySpellingReference(entry.id, sense) ? <span className="pill">Spelling reference</span> : <button
                    type="button"
                    className="btn line"
                    disabled={saving !== null}
                    onClick={() => void studySense(sense)}
                  >
                    <BookOpen size={15} />
                    {saving === sense.id ? "Saving…" : "Practise this sense"}
                  </button>}
                </div>
                <VocabularySenseContent entryId={entry.id} sense={sense} showLearningNotes />
                {diagram ? <DiagramPreview diagram={diagram} number={meaningNumbers.get(sense.id)} /> : null}
              </section>
            );})}
        </section>
      ))}
    </details>
  );
}
