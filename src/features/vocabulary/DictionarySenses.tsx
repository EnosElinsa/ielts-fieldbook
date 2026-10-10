import { useEffect, useState } from "react";
import { BookOpen, RotateCcw } from "lucide-react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useFieldbook } from "../../context/FieldbookContext";
import { addVocabularyItem, normalizeAnswer } from "../../domain/vocabulary";
import type { VocabularyEntry, VocabularySense } from "../../domain/vocabulary";
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
  const [senses, setSenses] = useState<VocabularySense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setSenses([]);
    setError("");
    setLoading(true);
    onSources?.([]);
    loadTermDictionary(entry.term)
      .then((data) => {
        if (active) {
          const excluded = new Set(excludeSenses.map(key));
          const seen = new Set(excluded);
          const unique = data.filter((sense) => {
            if (
              !sense ||
              typeof sense.id !== "string" ||
              typeof sense.definition !== "string" ||
              seen.has(key(sense))
            )
              return false;
            seen.add(key(sense));
            return true;
          });
          setSenses(unique);
          onSources?.(unique);
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
  const studySense = async (sense: VocabularySense) => {
    if (saving) return;
    setSaving(sense.id);
    setError("");
    const draft = structuredClone(fb.stateRef.current);
    const result = addVocabularyItem(draft, {
      ...entry,
      senses: [sense],
      sources: [
        ...(entry.sources || []),
        { type: "personal", id: `dictionary:${sense.id}`, senseId: sense.id },
      ],
    });
    try {
      if (result.item && (await fb.persistNow(draft))) {
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
      setError("This sense could not be saved. Try again.");
    } finally {
      setSaving(null);
    }
  };
  return (
    <details className="vocabulary-secondary vocabulary-dictionary">
      <summary>
        English dictionary
        {!loading && senses.length
          ? ` · ${senses.length} additional meanings`
          : ""}
      </summary>
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
      {senses.map((sense) => (
        <section className="vocabulary-sense" key={sense.id}>
          <div className="vocabulary-sense-head">
            <h4>{sense.pos || "Meaning"}</h4>
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
          <p>{sense.definition || "Definition not available yet"}</p>
          {sense.example ? (
            <blockquote>{sense.example}</blockquote>
          ) : (
            <p className="vocabulary-muted">Example not available yet</p>
          )}
        </section>
      ))}
    </details>
  );
}
