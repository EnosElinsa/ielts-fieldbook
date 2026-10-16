import { PanelLoadingState } from '../../components/AsyncState';
import { useVocabularySearchParams } from './vocabularyNavigation';
import { VocabularyLink as Link, VocabularyBackLink, useVocabularyReturn, vocabularyReturnLabel } from './VocabularyRouteLink';
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useParams,
  } from "react-router-dom";
import { ArrowRight, Pencil, RotateCcw, Trash2 } from "lucide-react";
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
import { accountId } from "../../storage/remote";
import { getVocabularyMastery } from "../../domain/vocabulary/mastery";
import { vocabularyLearningTimeline } from "../../domain/vocabulary/timeline";
import { vocabularySensePresentation } from "../../domain/vocabulary/dictionaryPresentation";
import { VocabularySenseContent } from "./VocabularySenseContent";
import { VocabularySourceLinks } from './VocabularySourceLinks';
import "../../styles/vocabulary-entry.css";
import { DictionarySenses } from "./DictionarySenses";
import { useConfirmationDialog } from '../../components/useConfirmationDialog';
import { VocabularyCredits, senseCredits } from "./VocabularyCredits";
import { VocabularyIllustration } from "./VocabularyIllustration";
import { VocabularyNavigation } from "./VocabularyPages";
import { Pronunciation } from "./Pronunciation";
import {
  groupPath,
  practiceUrl,
  useVocabularyCatalog,
  useVocabularyPosition,
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
const eventDate = (at: string | null | undefined) =>
  at && Number.isFinite(Date.parse(at))
    ? new Date(at).toLocaleString("en-GB", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Date unavailable";
export function VocabularyEntryPage() {
  const fb = useFieldbook();
  const state = fb.state as unknown as VocabularyStore & {
    settings?: {
      vocabulary?: unknown;
    };
  };
  const { id, entryId } = useParams();
  const confirmOwner = accountId();
  const { confirm, dialog } = useConfirmationDialog(`${confirmOwner}:${entryId || id}`);
  const [params] = useVocabularySearchParams();
  const location = useLocation();
  const bookId = params.get("bookId") || undefined;
  const unitId = params.get("unitId") || undefined;
  const requestedSense = params.get("senseId") || undefined;
  const { status, retry } = useVocabularyCatalog(
    fb.loadVocabularyCatalog,
    bookId,
    unitId,
    entryId || id,
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
  const saveLock = useRef(false);
  const mounted = useRef(true);
  const routeKey = location.pathname + location.search;
  const routeRef = useRef(routeKey);
  routeRef.current = routeKey;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setSaving(false);
    setSaveError("");
  }, [routeKey]);
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
  useVocabularyPosition(location.pathname + location.search + location.hash, Boolean(raw) && status === 'ready');
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
  const {to: returnTo} = useVocabularyReturn();
  const returnLabel = location.state?.vocabularyReturn ? vocabularyReturnLabel(returnTo) :
    returnTo === "/vocabulary"
      ? "My vocabulary"
      : /^\/vocabulary\/(review|study|history)/.test(returnTo)
        ? "Back to session word list"
        : /\/groups\/[^/?]+\/learn/.test(returnTo)
          ? "Back to learning cards"
          : returnTo.includes("/groups/")
          ? "Back to group words"
          : "Back to vocabulary";
  const origin = location.pathname + location.search;
  const entry = resolved?.entry;
  const primary = resolved?.sense;
  const image = resolved ? getVocabularyIllustration(resolved) : undefined;
  const saved = state.vocabulary?.some((item) => item.id === entry?.id);
  const timeline = entry ? vocabularyLearningTimeline(state, entry.id) : [];
  const locations = [
    ...new Map(
      [
        ...VOCABULARY_CATALOG.memberships.filter(
          (row) => row.entryId === entry?.id,
        ),
        ...(entry?.sources.filter((source) => source.bookId && source.unitId) ||
          []),
      ]
        .filter((source) => source.bookId && source.unitId)
        .map((source) => [
          `${source.bookId}:${source.unitId}`,
          { bookId: source.bookId!, unitId: source.unitId! },
        ]),
    ).values(),
  ];
  const sourceUrl = (source: { bookId: string; unitId: string }) => {
    const next = new URLSearchParams(params);
    next.set("bookId", source.bookId);
    next.set("unitId", source.unitId);
    next.delete("senseId");
    return `${location.pathname}?${next}`;
  };
  const others =
    entry?.senses.filter(
      (sense) =>
        sense.id !== primary?.id &&
        ((saved && raw?.senses.some((item) => item.id === sense.id)) ||
          resolved?.curriculum?.senses.some((item) => item.id === sense.id)) &&
        !(
          sense.pos === primary?.pos && sense.definition === primary?.definition
        ),
    ) || [];
  // Legacy top-level notes only add information when no stored sense contains it.
  // Public dictionary snapshots and learning revisions are already represented above.
  const publicEntry = raw &&
    (VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[]).find(
      (item) => item.id === raw.id,
    );
  const originalNotes = raw
    ? vocabularySensePresentation({
        id: 'original-notes',
        pos: '',
        definition:
          raw.meaning !== publicEntry?.meaning &&
          !raw.senses.some((sense) => sense.definition === raw.meaning)
            ? raw.meaning
            : '',
        example:
          raw.example !== publicEntry?.example &&
          !raw.senses.some((sense) => sense.example === raw.example)
            ? raw.example
            : '',
      })
    : undefined;
  const changeStatus = async (value: string, senseId: string) => {
    if (saveLock.current) return;
    saveLock.current = true;
    const owner = accountId();
    const requestedRoute = routeRef.current;
    const active = () =>
      mounted.current &&
      owner === accountId() &&
      requestedRoute === routeRef.current;
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
        value as VocabularyStatus | "automatic",
        senseId,
      );
      let feedback = '';
      const options = { onError: (message: string) => { feedback = message; } };
      const didSave = fb.saveVocabularyStatus
        ? await fb.saveVocabularyStatus(
            entry!.id,
            senseId,
            value as VocabularyStatus | "automatic",
            selectedSense ? { ...entry!, senses: [selectedSense] } : undefined,
            options,
          )
        : await fb.persistNow(draft, { ...options, collections: ['vocabulary', 'vocabularyStates'] });
      if (!active()) return;
      if (didSave) fb.toast("Mastery preference saved.");
      else setSaveError(feedback || "Familiarity could not be saved. Try again.");
    } catch {
      if (active()) setSaveError("Familiarity could not be saved. Try again.");
    } finally {
      saveLock.current = false;
      if (active()) setSaving(false);
    }
  };
  const renderSense = (sense: VocabularySense, main = false) => {
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
    const content = vocabularySensePresentation(sense);
    return (
      <section
        className={`vocabulary-sense${main ? " vocabulary-primary-meaning" : ""}`}
        key={sense.id}
      >
        <div className="vocabulary-sense-head">
          <h3>
            {main
              ? resolved?.curriculum
                ? "Current learning meaning"
                : resolved?.reviewed
                ? "Meaning in this group"
                : "Common meaning"
              : sense.pos || "Other meaning"}
          </h3>
        </div>
        {sense.pos ? (
          <span className="vocabulary-part-of-speech">{sense.pos}</span>
        ) : null}
        <VocabularySenseContent sense={sense} />
        {((main && resolved?.contentReviewed) || personalNotes) &&
        sense.collocations?.length ? (
          <div className="vocabulary-detail">
            <h4>{personalNotes ? "Your collocation notes" : "Collocations"}</h4>
            <p>{sense.collocations.join(" · ")}</p>
          </div>
        ) : null}
        {((main && resolved?.contentReviewed) || personalNotes) &&
        content.register ? (
          <div className="vocabulary-detail">
            <h4>
              {personalNotes ? "Your register note" : "Reviewed register"}
            </h4>
            <p>{content.register}</p>
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
      <VocabularyBackLink label={returnLabel}/>
      {!entry ? (
        status === "loading" ? (
          <PanelLoadingState variant="document" message="Loading vocabulary entry…" onRetry={retry} retryLabel="Retry entry" />
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
                      if (!await confirm({ title: 'Archive this vocabulary?', description: entry.term, confirmLabel: 'Archive vocabulary', destructive: true }) || accountId() !== confirmOwner) return;
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
          <div
            className={`vocabulary-meaning-layout${image ? " has-illustration" : ""}`}
          >
            <div>
              {primary ? (
                <>
                  {validGroup ? (
                    resolved?.curriculum ? (
                      <details className="vocabulary-context-notice">
                        <summary>{!resolved.curriculumCurrent ? 'Your selected meaning' : resolved.curriculum.basis === 'source' ? 'Meaning in this listening passage' : resolved.curriculum.basis === 'theme' ? 'Theme learning meaning' : resolved.curriculum.basis === 'multiple' ? 'Multiple meanings to learn' : 'Common meaning to learn'}</summary>
                        <p>{resolved.curriculumCurrent ? resolved.curriculum.explanation : 'You are viewing a different dictionary meaning or your own edited learning notes. This selection is separate from the group learning recommendation.'}</p>
                      </details>
                    ) : resolved?.reviewed ? (
                      <p className="vocabulary-context-label">
                        Selected group meaning
                      </p>
                    ) : (
                      <details className="vocabulary-context-notice">
                        <summary>General dictionary meaning</summary>
                        <p>
                          This dictionary meaning is available for general study. Source-group interpretation has not been verified.
                        </p>
                      </details>
                    )
                  ) : null}
                  {renderSense(primary, true)}
                </>
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
          {others.length ? (
            <details className="vocabulary-secondary">
              <summary>Other learning meanings · {others.length}</summary>
              {[...new Set(others.map((sense) => sense.pos || "Meaning"))].map(
                (pos) => (
                  <section className="vocabulary-dictionary-pos" key={pos}>
                    <h3>{pos}</h3>
                    {others
                      .filter((sense) => (sense.pos || "Meaning") === pos)
                      .map((sense, index) => (
                        <div
                          className="vocabulary-numbered-meaning"
                          key={sense.id}
                        >
                          <span className="vocabulary-muted">
                            Meaning {index + 1}
                          </span>
                          {renderSense(sense)}
                        </div>
                      ))}
                  </section>
                ),
              )}
            </details>
          ) : null}
          <DictionarySenses
            entry={entry}
            excludeSenses={[...(primary ? [primary] : []), ...others]}
            onSources={setDictionarySources}
          />
          <section
            className="vocabulary-learning-progress"
            aria-label="Learning progress"
          >
            <h3>Learning progress</h3>
            <p className="vocabulary-muted">
              Statuses use spaced retrieval evidence across four skills. These
              are Fieldbook learning rules; FSRS schedules reviews.
            </p>
            {[...(primary ? [primary] : []), ...others].map((sense, index) => {
              const mastery = getVocabularyMastery(state, entry.id, sense.id);
              return (
                <section className="vocabulary-mastery-sense" key={sense.id}>
                  <h4>
                      {index === 0
                        ? "Progress for this meaning"
                      : `${sense.pos || "Meaning"} · ${sense.definition}`}
                  </h4>
                  <div className="vocabulary-mastery-status">
                    <strong>{label(mastery.effective)}</strong>
                    <span className="pill">
                      {mastery.manual ? "Manual" : "Automatic"}
                    </span>
                    {mastery.manual ? (
                      <span>System estimate: {label(mastery.automatic)}</span>
                    ) : null}
                  </div>
                  {saved ? (
                    <div className="vocabulary-mastery-actions">
                      <fieldset
                        disabled={saving}
                        aria-label="Mastery adjustment"
                      >
                        <FilterMenu
                          label={
                            index === 0
                              ? "Familiarity for this meaning"
                              : `Familiarity for ${sense.pos} meaning`
                          }
                          value={
                            mastery.manual ? mastery.effective : "automatic"
                          }
                          onChange={(value) =>
                            void changeStatus(value, sense.id)
                          }
                          options={[
                            { value: "automatic", label: "Use automatic" },
                            ...statuses.map((value) => ({
                              value,
                              label: label(value),
                            })),
                          ]}
                        />
                      </fieldset>
                      {mastery.manual ? (
                        <button
                          className="btn line"
                          disabled={saving}
                          onClick={() =>
                            void changeStatus("automatic", sense.id)
                          }
                        >
                          Use automatic
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="vocabulary-muted">
                      Practise this meaning to start your learning record.
                    </p>
                  )}
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
                          {mastery.dimensions[dimension].spacedSuccesses} spaced
                          successes
                        </span>
                        <small>
                          {mastery.dimensions[dimension].nextReviewAt
                            ? `Next review: ${eventDate(mastery.dimensions[dimension].nextReviewAt)}`
                            : "Not scheduled"}
                        </small>
                      </div>
                    ))}
                  </div>
                  <p className="vocabulary-muted">
                    Assessed use: {mastery.productionSuccesses} successful
                    spaced reviews
                  </p>
                  {mastery.missing.length ? (
                    <details className="vocabulary-mastery-requirements">
                      <summary>What to practise next</summary>
                      <ul>
                        {mastery.missing.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                      <p>
                        Familiar: 3 spaced successes per skill. Mastered: 5 per
                        skill and 2 assessed use successes. Counted successes in
                        each skill must be at least 24 hours apart.
                      </p>
                    </details>
                  ) : null}
                </section>
              );
            })}
            {saving ? <p role="status">Saving mastery preference…</p> : null}
          </section>
          <details className="vocabulary-secondary vocabulary-timeline">
            <summary>Learning history ({timeline.length})</summary>
            <p className="vocabulary-muted">
              Each saved review appears once. Dictation records both listening
              and spelling. Older evidence without a linked review remains
              separate.
            </p>
            {!timeline.length ? (
              <p>
                No saved learning events yet. Start an assessment to build your
                evidence.
              </p>
            ) : (
              <ol>
                {timeline.map((event, index) => (
                  <li key={`${event.id}:${index}`}>
                    <div className="vocabulary-event-head">
                      <strong>{event.sourceLabel || label(event.mode)}</strong>
                      <span>Result: {label(event.result)}</span>
                    </div>
                    {event.dimensions.length ? (
                      <p className="vocabulary-event-dimensions">
                        {event.dimensions.map(label).join(" + ")}
                      </p>
                    ) : null}
                    <p>
                      Verification:{" "}
                      {event.verification
                        ? label(event.verification)
                        : "Not recorded"}
                    </p>
                    <p>{event.response || "No answer recorded"}</p>
                    {event.mode === "dictation" &&
                    event.result === "failure" &&
                    isRegionalSpellingDifference(
                      entry.term,
                      event.response || "",
                    ) ? (
                      <p className="vocabulary-muted">
                        This spelling is accepted in current assessments. The
                        historical result remains Failure.
                      </p>
                    ) : null}
                    {event.senseId && event.senseId !== primary?.id ? (
                      <small>
                        Meaning:{" "}
                        {entry.senses.find(
                          (sense) => sense.id === event.senseId,
                        )?.definition || "Previous learning meaning"}
                      </small>
                    ) : null}
                    {event.bookId && event.unitId ? (
                      <small>
                        {groupPath(event.bookId, event.unitId) ||
                          "Recorded source group"}
                      </small>
                    ) : null}
                    <time dateTime={event.occurredAt || undefined}>
                      {eventDate(event.occurredAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </details>
          {entry.sources.some(source => source.exam) && <section className="vocabulary-exam-sources" aria-label="Exam sources">
            <h3>Exam sources</h3><p className="vocabulary-muted">Return to the original paragraph or sentence for this word. Each saved occurrence keeps its source.</p>
            <VocabularySourceLinks sources={entry.sources} />
          </section>}
          <section
            className="vocabulary-source-locations"
            aria-label="Wordbook sources"
          >
            <h3>Wordbook sources</h3>
            <p className="vocabulary-muted">
              A word can appear in several groups. Select a source to view its
              learning meaning; the same meaning shares learning progress.
            </p>
            {locations.length ? (
              <ul>
                {locations.map((source) => (
                  <li key={`${source.bookId}:${source.unitId}`}>
                    <Link
                      to={sourceUrl(source)}
                      replace preserveReturn
                      aria-current={
                        validGroup &&
                        source.bookId === bookId &&
                        source.unitId === unitId
                          ? "page"
                          : undefined
                      }
                    >
                      {groupPath(source.bookId, source.unitId) ||
                        `${source.bookId} / ${source.unitId}`}
                      {validGroup &&
                      source.bookId === bookId &&
                      source.unitId === unitId ? (
                        <span className="pill">Current source</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="vocabulary-muted">
                No wordbook source linked. Your personal word is available for
                practice.
              </p>
            )}
          </section>
          {originalNotes && (originalNotes.definition || originalNotes.example) ? (
            <details className="vocabulary-secondary">
              <summary>Original notes</summary>
              {originalNotes.definition ? <p>{originalNotes.definition}</p> : null}
              {originalNotes.example ? <blockquote>{originalNotes.example}</blockquote> : null}
            </details>
          ) : null}
          <VocabularyCredits credits={credits} />
        </>
      )}
      {dialog}
    </section>
  );
}
