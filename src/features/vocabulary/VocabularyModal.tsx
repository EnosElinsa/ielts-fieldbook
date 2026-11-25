// @ts-nocheck
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useFieldbook } from "../../context/FieldbookContext";
import { ModalFrame } from "../../components/ModalFrame";
import { FilterMenu } from "../../components/ui";
import {
  addVocabularyItem,
  updateVocabularyItem,
} from "../../domain/vocabulary";
import "../../styles/vocabulary.css";
import { VocabularyCollectionDialog } from './VocabularyCollectionDialog';

/** The meaning the learner chose to edit is the one displayed, which is not always senses[0]. */
function editedSenseOf(editing, seed) {
  const displayed = editing && seed?.id === editing.id ? seed.editSense : undefined;
  return displayed?.id ? displayed : editing?.senses?.[0];
}

export function VocabularyModal() {
  const fb = useFieldbook();
  const open = fb.modal === "vocabulary";
  const [form, setForm] = useState({
    term: "",
    category: "word",
    meaning: "",
    example: "",
    tags: "",
    skill: "",
    pos: "",
    collocations: "",
    usage: "",
    synonyms: "",
    antonyms: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editing = (fb.state.vocabulary || []).find(
    (item) => item.id === fb.editingVocabularyId,
  );
  const sourceQuote = (editing || fb.vocabularySeed)?.sources?.filter(source => source.exam?.quote).map(source => source.exam.quote).join(' ');
  useEffect(() => {
    if (!open) return;
    const item = editing || fb.vocabularySeed || {};
    const sense = (editing ? editedSenseOf(editing, fb.vocabularySeed) : item.senses?.[0]) || {};
    setForm({
      term: item.term || "",
      category: item.category || "word",
      meaning: sense.definition || item.meaning || "",
      example: sense.example || item.example || "",
      tags: Array.isArray(item.tags) ? item.tags.join("; ") : item.tags || "",
      skill:
        item.sources?.find((source) => source.skill)?.skill || item.skill || "",
      pos: sense.pos || "",
      collocations: (sense.collocations || []).join("; "),
      usage: Array.isArray(sense.usage)
        ? sense.usage.join("; ")
        : sense.usage || "",
      synonyms: (sense.synonyms || [])
        .map((value) => (typeof value === "string" ? value : value.term))
        .join("; "),
      antonyms: (sense.antonyms || [])
        .map((value) => (typeof value === "string" ? value : value.term))
        .join("; "),
    });
    setError("");
    setSaving(false);
  }, [open, fb.editingVocabularyId, fb.vocabularySeed]);
  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const split = (value) =>
    value
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    if (!form.term.trim()) {
      setError("Enter a word, phrase, or sentence pattern.");
      return;
    }
    setSaving(true);
    setError("");
    const draft = structuredClone(fb.stateRef.current);
    const original = editing || fb.vocabularySeed || {};
    const target = editing ? editedSenseOf(editing, fb.vocabularySeed) : undefined;
    const storedTarget = target ? (original.senses || []).find((sense) => sense.id === target.id) : undefined;
    // A displayed meaning absent from the saved entry is added under its own id.
    const addDisplayed = Boolean(target && !storedTarget);
    const editsFirst = !target || (original.senses || [])[0]?.id === target.id;
    const firstSense = (editing ? storedTarget || target : original.senses?.[0]) || {};
    const sourceSkill = form.skill || original.skill;
    const normalizedCollocations = split(form.collocations);
    const normalizedSynonyms = split(form.synonyms);
    const normalizedAntonyms = split(form.antonyms);
    const normalizedUsage = form.usage.trim();
    const contentChanged = Boolean(
      editing && (
        form.meaning.trim() !== (firstSense.definition || '').trim() ||
        form.example.trim() !== (firstSense.example || '').trim() ||
        form.pos !== (firstSense.pos || '') ||
        (normalizedCollocations.length > 0 || firstSense.collocations !== undefined) && JSON.stringify(normalizedCollocations) !== JSON.stringify(firstSense.collocations || []) ||
        (normalizedUsage.length > 0 || firstSense.usage !== undefined) && normalizedUsage !== (Array.isArray(firstSense.usage) ? firstSense.usage.join('; ') : firstSense.usage || '').trim() ||
        (normalizedSynonyms.length > 0 || firstSense.synonyms !== undefined) && JSON.stringify(normalizedSynonyms) !== JSON.stringify((firstSense.synonyms || []).map(v => typeof v === 'string' ? v : v.term)) ||
        (normalizedAntonyms.length > 0 || firstSense.antonyms !== undefined) && JSON.stringify(normalizedAntonyms) !== JSON.stringify((firstSense.antonyms || []).map(v => typeof v === 'string' ? v : v.term))
      )
    );
    const editedSense = {
      ...firstSense,
      definition: form.meaning.trim(),
      example: form.example.trim(),
      pos: form.pos,
      ...(firstSense.collocations !== undefined || normalizedCollocations.length ? { collocations: normalizedCollocations } : {}),
      ...(firstSense.usage !== undefined || normalizedUsage ? { usage: normalizedUsage } : {}),
      ...(firstSense.synonyms !== undefined || normalizedSynonyms.length ? { synonyms: normalizedSynonyms } : {}),
      ...(firstSense.antonyms !== undefined || normalizedAntonyms.length ? { antonyms: normalizedAntonyms } : {}),
      ...(contentChanged ? { source: 'Personal note' } : {}),
    };
    const input = {
      ...original,
      term: form.term.trim(),
      category: form.category,
      // Top-level meaning/example mirror senses[0]; never send them for another meaning.
      meaning: editsFirst ? form.meaning.trim() : undefined,
      example: editsFirst ? form.example.trim() : undefined,
      tags: split(form.tags),
      senses: addDisplayed
        ? undefined
        : editsFirst
          ? [editedSense, ...(original.senses || []).slice(1)]
          : [editedSense],
      sources: original.sources?.length
        ? original.sources
        : [
            {
              type: original.sourceType || sourceSkill || "personal",
              id: original.sourceId || original.source || "manual",
              ...(sourceSkill ? { skill: sourceSkill } : {}),
              ...(original.context ? { context: original.context } : {}),
            },
          ],
    };
    let result = fb.editingVocabularyId
      ? updateVocabularyItem(draft, fb.editingVocabularyId, input)
      : addVocabularyItem(draft, input);
    if (result && !result.invalid && addDisplayed) {
      result = addVocabularyItem(draft, {
        term: form.term.trim(),
        category: form.category,
        senses: [editedSense],
        sources: original.sources,
      });
    }
    if (!result || result.invalid) {
      setError(
        result?.reason ||
          "This entry could not be saved. Check the word and definition.",
      );
      setSaving(false);
      return;
    }
    let feedback = '';
    try {
      if (await fb.persistNow(draft, { collections: ['vocabulary', 'vocabularyStates'], onError: message => { feedback = message; } })) {
        fb.setEditingVocabularyId(null);
        fb.setVocabularySeed(null);
        fb.closeModal();
        fb.toast(
          result.duplicate
            ? "Existing vocabulary updated."
            : "Vocabulary saved.",
        );
      } else
        setError(feedback || 'Vocabulary could not be saved. Your changes are still here.');
    } catch {
      setError("Vocabulary could not be saved. Your changes are still here.");
    }
    setSaving(false);
  };
  const fields = [
    ["term", "Word / phrase / pattern"],
    ["meaning", "English definition"],
    ["example", "Example sentence"],
    ["tags", "Tags"],
    ["pos", "Part of speech"],
    ["collocations", "Collocations"],
    ["usage", "Usage notes"],
    ["synonyms", "Synonyms"],
    ["antonyms", "Antonyms"],
  ];
  if (!editing) return <VocabularyCollectionDialog open={open} seed={fb.vocabularySeed} />;
  return (
    <ModalFrame
      open={open}
      busy={saving}
      title={editing ? "Edit vocabulary" : "Add vocabulary"}
      onClose={() => {
        if (!saving) fb.closeModal();
      }}
    >
      <form className="modal vocabulary-modal" onSubmit={save}>
        <h3>{editing ? "Edit vocabulary" : "Add vocabulary"}</h3>
        {sourceQuote && <div className="vocabulary-capture-context"><strong>Original selection</strong><blockquote>{sourceQuote}</blockquote><p>You can edit the term to its dictionary form. The original wording and source link are kept.</p></div>}
        <div className="form">
          <div className="field">
            <label>Type</label>
            <FilterMenu
              label="Vocabulary type"
              value={form.category}
              onChange={(value) => change("category", value)}
              options={[
                { value: "word", label: "Word" },
                { value: "phrase", label: "Phrase" },
                { value: "sentence", label: "Sentence pattern" },
              ]}
            />
          </div>
          <div className="field">
            <label>Source skill</label>
            <FilterMenu
              label="Source skill"
              value={form.skill}
              onChange={(value) => change("skill", value)}
              options={[
                { value: "", label: "No skill assigned" },
                ...["writing", "speaking", "listening", "reading"].map(
                  (value) => ({
                    value,
                    label: value[0].toUpperCase() + value.slice(1),
                  }),
                ),
              ]}
            />
          </div>
          {fields.map(([key, title]) => (
            <div
              className={`field${["meaning", "example", "usage"].includes(key) ? " full" : ""}`}
              key={key}
            >
              <label htmlFor={`vocabulary-${key}`}>{title}</label>
              {["example", "usage"].includes(key) ? (
                <textarea
                  id={`vocabulary-${key}`}
                  value={form[key]}
                  onChange={(event) => change(key, event.target.value)}
                  rows={3}
                />
              ) : (
                <input
                  id={`vocabulary-${key}`}
                  value={form[key]}
                  onChange={(event) => change(key, event.target.value)}
                  required={key === "term"}
                />
              )}
            </div>
          ))}
        </div>
        {error ? (
          <p role="alert" className="vocabulary-error">
            {error}
          </p>
        ) : null}
        <div className="modal-foot">
          <button
            className="btn line"
            type="button"
            disabled={saving}
            onClick={() => fb.closeModal()}
          >
            Cancel
          </button>
          <button className="btn primary" type="submit" disabled={saving}>
            <Save size={16} />
            {saving ? "Saving..." : "Save vocabulary"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
