import { useEffect, useMemo, useState } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ArrowLeft, ArrowRight, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useFieldbook } from "../../context/FieldbookContext";
import { FilterMenu } from "../../components/ui";
import {
  addVocabularyItem,
  removeVocabularyItem,
  setVocabularyManualStatus,
} from "../../domain/vocabulary";
import type {
  VocabularySense,
  VocabularyEntry,
  VocabularyStore,
  VocabularyDimension,
  VocabularyStatus,
  VocabularyEvidence,
} from "../../domain/vocabulary/types";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";
import { hasVocabularySenseEdits } from "../../domain/vocabulary/content";
import { resolveVocabularyLearningContext } from "../../domain/vocabulary/context";
import {
  aggregateMediaCredits,
  getVocabularyIllustration,
  type VocabularyRecording,
} from "../../domain/vocabulary/media";
import { normalizeVocabularyPreferences } from "../../domain/vocabulary/preferences";
import { isRegionalSpellingDifference } from "../../domain/vocabulary/spelling";
import { DictionarySenses } from "./DictionarySenses";
import { VocabularyCredits, senseCredits } from "./VocabularyCredits";
import { VocabularyIllustration } from "./VocabularyIllustration";
import { VocabularyNavigation } from "./VocabularyPages";
import { Pronunciation } from "./Pronunciation";
import {
  groupPath,
  practiceUrl,
  safeVocabularyReturn,
  useVocabularyCatalog,
} from "./vocabularyNavigation";
const statuses = [
  "new",
  "unfamiliar",
  "unstable",
  "active",
  "familiar",
  "mastered",
];
const label = (value: string) =>
  value.replace(/^./, (char) => char.toUpperCase());
function EvidenceRecords({ records }: { records: VocabularyEvidence[] }) {
  return (
    <div className="vocabulary-evidence">
      {records
        .slice()
        .reverse()
        .map((item, index) => (
          <div key={item.id || `${item.occurredAt}:${index}`}>
            <span>{label(item.mode || item.dimension || "Usage")}</span>
            <span>
              Verification:{" "}
              {item.verification ? label(item.verification) : "Not recorded"}
            </span>
            <span>Result: {label(item.result)}</span>
            <p>{item.response || "No answer recorded"}</p>
            <small>
              {item.occurredAt
                ? new Date(item.occurredAt).toLocaleDateString("en-GB")
                : "Date unavailable"}
            </small>
          </div>
        ))}
    </div>
  );
}
export function VocabularyEntryPage() {
  const fb = useFieldbook();
  const state = fb.state as unknown as VocabularyStore & {
    settings?: {
      vocabulary?: unknown;
    };
  };
  const { id, entryId } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const bookId = params.get("bookId") || undefined;
  const unitId = params.get("unitId") || undefined;
  const requestedSense = params.get("senseId") || undefined;
  const { status, retry } = useVocabularyCatalog(
    fb.loadVocabularyCatalog,
    bookId,
  );
  const [accent, setAccent] = useState(
    () => normalizeVocabularyPreferences(state.settings?.vocabulary).accent,
  );
  const [dictionarySources, setDictionarySources] = useState<VocabularySense[]>(
    [],
  );
  const [recordings, setRecordings] = useState<VocabularyRecording[]>([]);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDictionarySources([]);
    setRecordings([]);
    setSaveError("");
  }, [id, entryId]);
  const raw =
    state.vocabulary?.find((entry) => entry.id === (id || entryId)) ||
    (VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[]).find(
      (entry) => entry.id === (id || entryId),
    );
  const validGroup = Boolean(
    bookId &&
    unitId &&
    VOCABULARY_CATALOG.units.some(
      (unit) => unit.bookId === bookId && unit.id === unitId,
    ) &&
    (VOCABULARY_CATALOG.memberships.some(
      (row) =>
        row.bookId === bookId &&
        row.unitId === unitId &&
        row.entryId === raw?.id,
    ) ||
      raw?.sources?.some(
        (source) => source.bookId === bookId && source.unitId === unitId,
      )),
  );
  const context = validGroup ? { bookId, unitId } : {};
  const resolved = useMemo(
    () =>
      raw
        ? resolveVocabularyLearningContext(raw, {
            ...context,
            senseId: requestedSense,
          })
        : null,
    [raw, bookId, unitId, requestedSense, validGroup],
  );
  const returnTo = safeVocabularyReturn(params.get("returnTo"));
  const returnLabel =
    returnTo === "/vocabulary"
      ? "My vocabulary"
      : /^\/vocabulary\/(review|study|history)/.test(returnTo)
        ? "Back to session word list"
        : returnTo.includes("/groups/")
          ? "Back to group words"
          : "Back to vocabulary";
  const origin = location.pathname + location.search;
  const entry = resolved?.entry;
  const primary = resolved?.sense;
  const image = resolved ? getVocabularyIllustration(resolved) : undefined;
  const saved = state.vocabulary?.some((item) => item.id === entry?.id);
  const evidence = (state.vocabularyEvidence || []).filter(
    (item) => item.entryId === entry?.id,
  );
  const others =
    entry?.senses.filter(
      (sense) =>
        sense.id !== primary?.id &&
        !(
          sense.pos === primary?.pos && sense.definition === primary?.definition
        ),
    ) || [];
  const changeStatus = async (value: string, senseId: string) => {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const draft = structuredClone(
        fb.stateRef.current,
      ) as unknown as VocabularyStore;
      const selectedSense = entry!.senses.find((sense) => sense.id === senseId);
      const stored = draft.vocabulary.find((item) => item.id === entry!.id);
      if (
        selectedSense &&
        stored &&
        !stored.senses.some((sense) => sense.id === senseId)
      )
        addVocabularyItem(draft, { ...entry!, senses: [selectedSense] });
      setVocabularyManualStatus(
        draft,
        entry!.id,
        value as VocabularyStatus,
        senseId,
      );
      if (await fb.persistNow(draft)) fb.toast("Familiarity updated.");
      else setSaveError("Familiarity could not be saved. Try again.");
    } catch {
      setSaveError("Familiarity could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };
  const renderSense = (sense: VocabularySense, main = false) => {
    const learningState = state.vocabularyStates?.find(
      (item) => item.entryId === entry?.id && item.senseId === sense.id,
    );
    const publicEntry = (
      VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[]
    ).find((item) => item.id === entry?.id);
    const publicSense = publicEntry
      ? resolveVocabularyLearningContext(publicEntry, {
          ...context,
          senseId: sense.id,
        }).sense
      : undefined;
    const personalNotes =
      sense.source === "Personal note" ||
      Boolean(
        saved && publicSense && hasVocabularySenseEdits(sense, [publicSense]),
      );
    return (
      <section
        className={`vocabulary-sense${main ? " vocabulary-primary-meaning" : ""}`}
        key={sense.id}
      >
        <div className="vocabulary-sense-head">
          <h3>
            {main
              ? resolved?.reviewed
                ? "Meaning in this group"
                : "Common meaning"
              : sense.pos || "Other meaning"}
          </h3>
          {saved ? (
            <FilterMenu
              label={
                main
                  ? "Familiarity for this meaning"
                  : `Familiarity for ${sense.pos} meaning`
              }
              value={learningState?.manualStatus || "new"}
              onChange={(value) => void changeStatus(value, sense.id)}
              options={statuses.map((value) => ({
                value,
                label: label(value),
              }))}
            />
          ) : null}
        </div>
        {sense.pos ? (
          <span className="vocabulary-part-of-speech">{sense.pos}</span>
        ) : null}
        <p className="vocabulary-definition">
          {sense.definition || "Definition not available yet"}
        </p>
        {sense.example ? (
          <blockquote>{sense.example}</blockquote>
        ) : (
          <p className="vocabulary-muted">Example not available yet</p>
        )}
        {((main && resolved?.contentReviewed) || personalNotes) &&
        sense.collocations?.length ? (
          <div className="vocabulary-detail">
            <h4>{personalNotes ? "Your collocation notes" : "Collocations"}</h4>
            <p>{sense.collocations.join(" · ")}</p>
          </div>
        ) : null}
        {sense.usage ? (
          <div className="vocabulary-detail">
            <h4>Usage note</h4>
            <p>{sense.usage}</p>
          </div>
        ) : null}
        {((main && resolved?.contentReviewed) || personalNotes) &&
        sense.register ? (
          <div className="vocabulary-detail">
            <h4>
              {personalNotes ? "Your register note" : "Reviewed register"}
            </h4>
            <p>{sense.register}</p>
          </div>
        ) : null}
        {personalNotes &&
        [
          sense.synonyms,
          sense.antonyms,
          sense.distinctions,
          sense.wordFamily,
        ].some((values) => values?.length) ? (
          <details className="vocabulary-secondary">
            <summary>Your other learning notes</summary>
            {[
              ["Synonym notes", sense.synonyms],
              ["Antonym notes", sense.antonyms],
              ["Distinction notes", sense.distinctions],
              ["Word family notes", sense.wordFamily],
            ].map(([title, values]) =>
              Array.isArray(values) && values.length ? (
                <div className="vocabulary-detail" key={String(title)}>
                  <h4>{String(title)}</h4>
                  <p>{values.join(" · ")}</p>
                </div>
              ) : null,
            )}
          </details>
        ) : null}
        {!main ? (
          <Link
            className="btn line"
            to={practiceUrl(entry!.id, sense.id, context, origin, "definition")}
          >
            Practise this sense
            <ArrowRight size={15} />
          </Link>
        ) : null}
        <details className="vocabulary-secondary">
          <summary>Learning evidence for this meaning</summary>
          <div className="vocabulary-dimensions">
            {(
              [
                "meaning",
                "listening",
                "spelling",
                "usage",
              ] as VocabularyDimension[]
            ).map((dimension) => (
              <div key={dimension}>
                <strong>{label(dimension)}</strong>
                <span>
                  {learningState?.dimensions?.[dimension]?.successes || 0}{" "}
                  successes /{" "}
                  {learningState?.dimensions?.[dimension]?.failures || 0}{" "}
                  failures
                </span>
                <small>
                  {learningState?.lastReviewedAt
                    ? "Previously reviewed"
                    : "Not reviewed"}
                </small>
              </div>
            ))}
          </div>
          <EvidenceRecords
            records={evidence.filter((item) => item.senseId === sense.id)}
          />
        </details>
      </section>
    );
  };
  const credits = [
    ...senseCredits([
      ...(primary ? [primary] : []),
      ...others,
      ...dictionarySources,
    ]),
    ...aggregateMediaCredits(recordings, image).map((credit) => ({
      ...credit,
      source:
        credit.sourceUrl === image?.sourceUrl ? "Illustration" : "Recording",
    })),
  ];
  return (
    <section className="view active vocabulary-view vocabulary-workbench">
      <VocabularyNavigation />
      <Link to={returnTo} className="btn text">
        <ArrowLeft size={15} />
        {returnLabel}
      </Link>
      {!entry ? (
        status === "loading" ? (
          <p role="status">Loading vocabulary entry…</p>
        ) : status === "error" ? (
          <div role="alert">
            Vocabulary entry could not be loaded.{" "}
            <button className="btn line" onClick={retry}>
              <RotateCcw size={15} />
              Retry entry
            </button>
          </div>
        ) : (
          <p>Vocabulary entry not found.</p>
        )
      ) : (
        <>
          <div className="page-tools vocabulary-entry-heading">
            <div>
              {validGroup ? (
                <p className="vocabulary-group-path">
                  {groupPath(bookId!, unitId!)}
                </p>
              ) : null}
              <h2>{entry.term}</h2>
              {entry.pronunciation?.ipa ? (
                <p className="vocabulary-muted vocabulary-ipa">
                  {entry.pronunciation.ipa}
                </p>
              ) : null}
            </div>
            <div className="actions">
              <FilterMenu
                label="Pronunciation accent"
                value={accent}
                onChange={(value) => setAccent(value as "uk" | "us")}
                options={[
                  { value: "uk", label: "UK" },
                  { value: "us", label: "US" },
                ]}
              />
              {saved ? (
                <>
                  <button
                    className="btn line"
                    onClick={() => {
                      fb.setEditingVocabularyId(entry.id as never);
                      fb.setVocabularySeed(raw as never);
                      fb.openModal("vocabulary");
                    }}
                  >
                    <Pencil size={16} />
                    Edit
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Archive vocabulary"
                    onClick={async () => {
                      if (!window.confirm(`Archive ${entry.term}?`)) return;
                      const draft = structuredClone(
                        fb.stateRef.current,
                      ) as unknown as VocabularyStore;
                      removeVocabularyItem(draft, entry.id);
                      if (await fb.persistNow(draft))
                        fb.toast("Vocabulary archived.");
                      else
                        setSaveError(
                          "Vocabulary could not be archived. Try again.",
                        );
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <Pronunciation
            entry={entry}
            accent={accent}
            onMedia={setRecordings}
          />
          <div className="vocabulary-entry-practice">
            {primary && !entry.tags.includes("archived") ? (
              <Link
                className="btn primary"
                to={practiceUrl(entry.id, primary.id, context, origin)}
              >
                Practise this word
                <ArrowRight size={16} />
              </Link>
            ) : null}
            {entry.tags.includes("archived") ? (
              <span className="pill">Archived · Excluded from practice</span>
            ) : null}
          </div>
          {bookId && unitId && !validGroup && status === "ready" ? (
            <p className="vocabulary-muted">
              The requested group does not contain this word. Showing its common
              meaning.
            </p>
          ) : null}
          {saveError ? (
            <p className="vocabulary-error" role="alert">
              {saveError}
            </p>
          ) : null}
          {validGroup && !resolved?.reviewed ? (
            <p className="vocabulary-muted">
              Group meaning not confirmed. This is the current common meaning.
            </p>
          ) : null}
          <div
            className={`vocabulary-meaning-layout${image ? " has-illustration" : ""}`}
          >
            <div>
              {primary ? (
                renderSense(primary, true)
              ) : (
                <section className="vocabulary-sense">
                  <h3>
                    {resolved?.reviewed
                      ? "Meaning in this group"
                      : "Common meaning"}
                  </h3>
                  <p>Definition not available yet</p>
                  <p>Example not available yet</p>
                </section>
              )}
            </div>
            {image ? (
              <VocabularyIllustration
                image={image}
                creditHref="#vocabulary-sources"
              />
            ) : null}
          </div>
          {raw &&
          ((raw.meaning && raw.meaning !== primary?.definition) ||
            (raw.example && raw.example !== primary?.example)) ? (
            <details className="vocabulary-secondary">
              <summary>Original notes</summary>
              {raw.meaning ? <p>{raw.meaning}</p> : null}
              {raw.example ? <blockquote>{raw.example}</blockquote> : null}
            </details>
          ) : null}
          {others.length ? (
            <details className="vocabulary-secondary">
              <summary>Other learning meanings · {others.length}</summary>
              {others.map((sense) => renderSense(sense))}
            </details>
          ) : null}
          <DictionarySenses
            entry={entry}
            excludeSenses={[...(primary ? [primary] : []), ...others]}
            onSources={setDictionarySources}
          />
          <details className="vocabulary-secondary">
            <summary>Review history</summary>
            {evidence.length ? (
              <section>
                <h4>Saved learning evidence</h4>
                <EvidenceRecords records={evidence} />
              </section>
            ) : null}
            <div className="vocabulary-evidence">
              {state.vocabularyReviews
                ?.filter((review) => review.entryId === entry.id)
                .slice(-30)
                .reverse()
                .map((review) => (
                  <div key={review.id}>
                    <span>{review.sourceLabel || label(review.mode)}</span>
                    <span>
                      {review.mode === "dictation" &&
                      review.result === "failure" &&
                      isRegionalSpellingDifference(
                        entry.term,
                        review.response || "",
                      )
                        ? "UK/US spelling accepted"
                        : label(review.result)}
                    </span>
                    <p>{review.response || "No answer recorded"}</p>
                    <small>
                      {review.occurredAt
                        ? new Date(review.occurredAt).toLocaleDateString(
                            "en-GB",
                          )
                        : "Date unavailable"}
                    </small>
                  </div>
                ))}
            </div>
          </details>
          <VocabularyCredits credits={credits} />
        </>
      )}
    </section>
  );
}
