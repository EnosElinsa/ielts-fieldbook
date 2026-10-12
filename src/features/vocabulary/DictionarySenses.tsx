import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, RotateCcw } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
  if (!dictionaryIndex)
    dictionaryIndex = fetch("/dictionary/index.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("Index unavailable");
        return response.json();
      })
      .catch((error) => {
        dictionaryIndex = null;
        throw error;
      });
  const index = await dictionaryIndex;
  const file = index[normalizeAnswer(term)];
  if (file && /^[a-f0-9]+\.json$/.test(file)) {
    const response = await fetch(`/dictionary/${file}`);
    if (!response.ok) throw new Error("Dictionary unavailable");
    const data = await response.json();
    if (!Array.isArray(data.senses)) throw new Error("Invalid dictionary");
    return data.senses as VocabularySense[];
  }
  if (!dictionaryRequest)
    dictionaryRequest = fetch("/vocabulary-dictionary.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("Dictionary unavailable");
        return response.json() as Promise<DictionaryFile>;
      })
      .catch((error) => {
        dictionaryRequest = null;
        throw error;
      });
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
        <p className="vocabulary-muted" role="status">
          Loading dictionary meanings…
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="vocabulary-error">
          {error}
          <button
            type="button"
            className="btn line"
            onClick={() => setRevision((value) => value + 1)}
            disabled={saving !== null}
          >
            <RotateCcw size={15} />
            Retry dictionary
          </button>
        </div>
      ) : null}
      {!loading && !senses.length && !error ? (
        <p className="vocabulary-muted">
          No additional dictionary senses available.
        </p>
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
