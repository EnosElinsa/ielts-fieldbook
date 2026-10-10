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
  useEffect(() => {
    if (!open) return;
    const item = editing || fb.vocabularySeed || {};
    const sense = item.senses?.[0] || {};
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
  }, [open, fb.editingVocabularyId]);
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
    const firstSense = original.senses?.[0] || {};
    const sourceSkill = form.skill || original.skill;
    const input = {
      ...original,
      term: form.term.trim(),
      category: form.category,
      meaning: form.meaning.trim(),
      example: form.example.trim(),
      tags: split(form.tags),
      senses: [
        {
          ...firstSense,
          definition: form.meaning.trim(),
          example: form.example.trim(),
          pos: form.pos,
          collocations: split(form.collocations),
          usage: form.usage.trim(),
          synonyms: split(form.synonyms),
          antonyms: split(form.antonyms),
        },
        ...(original.senses || []).slice(1),
      ],
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
    const result = fb.editingVocabularyId
      ? updateVocabularyItem(draft, fb.editingVocabularyId, input)
      : addVocabularyItem(draft, input);
    if (!result || result.invalid) {
      setError(
        result?.reason ||
          "This entry could not be saved. Check the word and definition.",
      );
      setSaving(false);
      return;
    }
    try {
      if (await fb.persistNow(draft)) {
        fb.setEditingVocabularyId(null);
        fb.setVocabularySeed(null);
        fb.closeModal();
        fb.toast(
          result.duplicate
            ? "Existing vocabulary updated."
            : "Vocabulary saved.",
        );
      } else
        setError("Vocabulary could not be saved. Your changes are still here.");
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
  return (
    <ModalFrame
      open={open}
      title={editing ? "Edit vocabulary" : "Add vocabulary"}
      onClose={() => {
        if (!saving) fb.closeModal();
      }}
    >
      <form className="modal vocabulary-modal" onSubmit={save}>
        <h3>{editing ? "Edit vocabulary" : "Add vocabulary"}</h3>
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
