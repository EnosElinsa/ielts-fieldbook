import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { InlineLoadingState, StateMessage } from '../../components/AsyncState';
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { vocabularyForwardState } from './VocabularyRouteLink';
import { useFieldbook } from "../../context/FieldbookContext";
import { addVocabularyItem, normalizeAnswer } from "../../domain/vocabulary";
import type { VocabularyEntry, VocabularySense } from "../../domain/vocabulary";
import { accountId } from "../../storage/remote";
import { VocabularySenseContent } from "./VocabularySenseContent";
import { practiceUrl } from "./vocabularyNavigation";
type DictionaryFile = {
  entries: {
    term: string;
    senses: VocabularySense[];
  }[];
};
let dictionaryRequest: Promise<DictionaryFile> | null = null;
let dictionaryIndex: Promise<Record<string, string>> | null = null;
export function resetDictionaryCache() {
  dictionaryRequest = null;
  dictionaryIndex = null;
}
async function loadTermDictionary(term: string) {
  if (!dictionaryIndex) {
    const request = fetch("/dictionary/index.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("Index unavailable");
        return response.json();
      })
      .catch((error) => {
        if (dictionaryIndex === request) dictionaryIndex = null;
        throw error;
      });
    dictionaryIndex = request;
  }
  const index = await dictionaryIndex;
  const file = index[normalizeAnswer(term)];
  if (file && /^[a-f0-9]+\.json$/.test(file)) {
    const response = await fetch(`/dictionary/${file}`);
    if (!response.ok) throw new Error("Dictionary unavailable");
    const data = await response.json();
    if (!Array.isArray(data.senses)) throw new Error("Invalid dictionary");
    return data.senses as VocabularySense[];
  }
  if (!dictionaryRequest) {
    const request = fetch("/vocabulary-dictionary.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("Dictionary unavailable");
        return response.json() as Promise<DictionaryFile>;
      })
      .catch((error) => {
        if (dictionaryRequest === request) dictionaryRequest = null;
        throw error;
      });
    dictionaryRequest = request;
  }
  const data = await dictionaryRequest;
  return (
    data.entries?.find(
      (item) => normalizeAnswer(item.term) === normalizeAnswer(term),
    )?.senses || []
  );
}
const key = (sense: VocabularySense) =>
  `${normalizeAnswer(sense.pos)}:${normalizeAnswer(sense.definition)}`;
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
  useEffect(() => {
    let active = true;
    setLoaded([]);
    setError("");
    setLoading(true);
    onSources?.([]);
    loadTermDictionary(entry.term)
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
  }, [entry.term, revision]);
  const excludeKey = excludeSenses.map(key).sort().join("\n");
  const senses = useMemo(() => {
    const seen = new Set(excludeSenses.map(key));
    return loaded.filter((sense) => {
      if (
        !sense ||
        typeof sense.id !== "string" ||
        typeof sense.definition !== "string" ||
        typeof sense.pos !== "string" ||
        seen.has(key(sense))
      )
        return false;
      seen.add(key(sense));
      return true;
    });
  }, [loaded, excludeKey]);
  useEffect(() => {
    onSources?.(senses);
  }, [senses, onSources]);
  const groups = [
    ...new Set(
      senses.map((sense) => sense.pos.trim().toLowerCase() || "Meaning"),
    ),
  ];
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
            })
          : await fb.persistNow(draft));
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
      } else setError("This sense could not be saved. Try again.");
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
          <h3>{pos.replace(/^./, (char) => char.toUpperCase())}</h3>
          {senses
            .filter(
              (sense) => (sense.pos.trim().toLowerCase() || "Meaning") === pos,
            )
            .map((sense, index) => (
              <section className="vocabulary-sense" key={sense.id}>
                <div className="vocabulary-sense-head">
                  <h4>Meaning {index + 1}</h4>
                  <button
                    type="button"
                    className="btn line"
                    disabled={saving !== null}
                    onClick={() => void studySense(sense)}
                  >
                    <BookOpen size={15} />
                    {saving === sense.id ? "Saving…" : "Practise this sense"}
                  </button>
                </div>
                <VocabularySenseContent sense={sense} />
              </section>
            ))}
        </section>
      ))}
    </details>
  );
}
