import { useEffect, useState } from "react";
import { List, Square, Volume2 } from "lucide-react";
import { ModalFrame } from "../../components/ModalFrame";
import {
  normalizeVocabularyPreferences,
  type VocabularyPreferences,
} from "../../domain/vocabulary/preferences";
import "../../styles/vocabulary-practice.css";

type FieldsProps = {
  value: VocabularyPreferences;
  onChange: (next: VocabularyPreferences) => void;
  disabled?: boolean;
  configurationLocked?: boolean;
};

export function VocabularyPreferencesFields({
  value,
  onChange,
  disabled = false,
  configurationLocked = false,
}: FieldsProps) {
  const update = (patch: Partial<VocabularyPreferences>) =>
    onChange(normalizeVocabularyPreferences({ ...value, ...patch }));
  const locked = disabled || configurationLocked;
  return (
    <div className="practice-preferences">
      <fieldset disabled={locked}>
        <legend>Practice</legend>
        <div className="practice-preference-grid">
          <label>
            Default mode
            <select
              aria-label="Default mode"
              value={value.mode}
              onChange={(event) =>
                update({
                  mode: event.target.value as VocabularyPreferences["mode"],
                })
              }
            >
              {[
                { value: "dictation", label: "Dictation" },
                { value: "definition", label: "Definition recall" },
                { value: "cloze", label: "Cloze" },
                { value: "distinction", label: "Synonym / distinction" },
                { value: "audio", label: "Audio loop" },
                { value: "production", label: "Sentence production" },
              ].map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Session size
            <select
              aria-label="Session size"
              value={value.sessionSize}
              onChange={(event) =>
                update({ sessionSize: Number(event.target.value) })
              }
            >
              {[5, 10, 20, 50, 100].map((count) => (
                <option value={count} key={count}>
                  {count} words
                </option>
              ))}
            </select>
          </label>
          <label>
            Feedback
            <select
              aria-label="Feedback"
              value={value.feedback}
              onChange={(event) =>
                update({
                  feedback: event.target
                    .value as VocabularyPreferences["feedback"],
                })
              }
            >
              <option value="end">After submission</option>
              <option value="immediate">During practice</option>
            </select>
          </label>
          <label>
            Order
            <select
              aria-label="Order"
              value={value.order}
              onChange={(event) =>
                update({
                  order: event.target.value as VocabularyPreferences["order"],
                })
              }
            >
              <option value="source">Source order</option>
              <option value="due">Due date</option>
              <option value="random">Shuffle</option>
            </select>
          </label>
          <div className="practice-layout-field">
            <span>Layout</span>
            <div
              className="practice-layout-toggle"
              role="group"
              aria-label="Practice layout"
            >
              <button
                type="button"
                title="List"
                aria-label="List layout"
                aria-pressed={value.layout === "list"}
                onClick={() => update({ layout: "list" })}
              >
                <List size={17} />
                List
              </button>
              <button
                type="button"
                title="Focus"
                aria-label="Focus layout"
                aria-pressed={value.layout === "cards"}
                onClick={() => update({ layout: "cards" })}
              >
                <Square size={16} />
                Focus
              </button>
            </div>
          </div>
        </div>
        <label className="practice-switch">
          <input
            type="checkbox"
            checked={value.autoAdvance}
            onChange={(event) => update({ autoAdvance: event.target.checked })}
          />
          Advance with Enter
        </label>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>
          <Volume2 size={16} />
          Audio
        </legend>
        <div className="practice-preference-grid">
          <label>
            Accent
            <select
              aria-label="Accent"
              value={value.accent}
              onChange={(event) =>
                update({
                  accent: event.target.value as VocabularyPreferences["accent"],
                })
              }
            >
              <option value="uk">British English</option>
              <option value="us">American English</option>
            </select>
          </label>
          <label>
            Playback speed
            <select
              aria-label="Playback speed"
              value={value.speechRate}
              onChange={(event) =>
                update({ speechRate: Number(event.target.value) })
              }
            >
              {[0.6, 0.8, 1, 1.2, 1.5].map((rate) => (
                <option key={rate} value={rate}>
                  {rate}×
                </option>
              ))}
            </select>
          </label>
          <label>
            Repeat
            <select
              aria-label="Repeat"
              value={value.repeatCount}
              onChange={(event) =>
                update({ repeatCount: Number(event.target.value) })
              }
            >
              {[1, 2, 3, 5].map((count) => (
                <option key={count} value={count}>
                  {count === 1 ? "Once" : `${count} times`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Repeat gap
            <select
              aria-label="Repeat gap"
              value={value.repeatGapMs}
              onChange={(event) =>
                update({ repeatGapMs: Number(event.target.value) })
              }
            >
              {[0, 500, 800, 1000, 1500, 2000, 3000].map((gap) => (
                <option key={gap} value={gap}>
                  {gap / 1000} seconds
                </option>
              ))}
            </select>
          </label>
          <label>
            Audio loop gap
            <select
              aria-label="Audio loop gap"
              value={value.audioGapMs}
              onChange={(event) =>
                update({ audioGapMs: Number(event.target.value) })
              }
            >
              {[0, 500, 1000, 1500, 2000, 3000, 5000].map((gap) => (
                <option key={gap} value={gap}>
                  {gap / 1000} seconds
                </option>
              ))}
            </select>
          </label>
          <label>
            Volume{" "}
            <span className="practice-volume-value">
              {Math.round(value.volume * 100)}%
            </span>
            <input
              aria-label="Volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={value.volume}
              onChange={(event) =>
                update({ volume: Number(event.target.value) })
              }
            />
          </label>
        </div>
        <div className="practice-preference-switches">
          <label className="practice-switch">
            <input
              type="checkbox"
              checked={value.autoPlay}
              onChange={(event) => update({ autoPlay: event.target.checked })}
            />
            Autoplay
          </label>
          <label className="practice-switch">
            <input
              type="checkbox"
              checked={value.audioExamples}
              onChange={(event) =>
                update({ audioExamples: event.target.checked })
              }
            />
            Examples in audio loop
          </label>
        </div>
      </fieldset>
    </div>
  );
}

export function VocabularyPreferencesDialog({
  open,
  onClose,
  preferences,
  onSave,
  busy = false,
  configurationLocked = false,
}: {
  open: boolean;
  onClose: () => void;
  preferences: VocabularyPreferences;
  onSave: (
    value: VocabularyPreferences,
  ) => boolean | void | Promise<boolean | void>;
  busy?: boolean;
  configurationLocked?: boolean;
}) {
  const [draft, setDraft] = useState(() =>
    normalizeVocabularyPreferences(preferences),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setDraft(normalizeVocabularyPreferences(preferences));
      setError("");
    }
  }, [open]);
  async function save() {
    if (saving || busy) return;
    setSaving(true);
    setError("");
    try {
      const saved = await onSave(draft);
      if (saved === false)
        setError("Preferences could not be saved. Try again.");
      else onClose();
    } catch {
      setError("Preferences could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <ModalFrame
      open={open}
      onClose={() => {
        if (!saving && !busy) onClose();
      }}
      title="Practice settings"
    >
      <div className="practice-settings-dialog">
        <div className="practice-dialog-heading">
          <span className="eyebrow">Vocabulary</span>
          <h2>Practice settings</h2>
        </div>
        <VocabularyPreferencesFields
          value={draft}
          onChange={setDraft}
          disabled={busy || saving}
          configurationLocked={configurationLocked}
        />
        {error ? (
          <p className="practice-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="actions practice-dialog-actions">
          <button
            className="btn line"
            type="button"
            disabled={busy || saving}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={busy || saving}
            onClick={save}
          >
            {saving ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
