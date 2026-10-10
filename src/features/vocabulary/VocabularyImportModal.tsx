// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { Download, Eye, Upload } from "lucide-react";
import { useFieldbook } from "../../context/FieldbookContext";
import { ModalFrame } from "../../components/ModalFrame";
import {
  mergeVocabularyImport,
  parseVocabularyImport,
  previewVocabularyImport,
} from "../../domain/vocabulary/import";
import "../../styles/vocabulary.css";

export function VocabularyImportModal() {
  const fb = useFieldbook();
  const open = fb.modal === "vocabularyImport";
  const [text, setText] = useState("");
  const [filename, setFilename] = useState("vocabulary.json");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(null);
  const fileInput = useRef(null);
  useEffect(() => {
    if (open) {
      setText("");
      setFilename("vocabulary.json");
      setPreview(null);
      setError("");
      setSaving(false);
      pending.current = null;
    }
  }, [open]);
  const resetPreview = () => {
    setPreview(null);
    setError("");
    pending.current = null;
  };
  const readFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    resetPreview();
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose a file smaller than 10 MB.");
      return;
    }
    try {
      setText(await file.text());
      setFilename(file.name);
    } catch {
      setError("The selected file could not be read.");
    }
  };
  const inspect = () => {
    setError("");
    pending.current = null;
    try {
      const parsed = parseVocabularyImport(
        text,
        filename.toLowerCase().endsWith(".csv") && !/^\s*[\[{]/.test(text)
          ? "csv"
          : "auto",
      );
      if (parsed.valid === false) {
        setPreview(null);
        setError(
          parsed.reason || "This file is not a supported vocabulary export.",
        );
        return;
      }
      const batch = parsed.batch || parsed;
      const report = previewVocabularyImport(fb.stateRef.current, batch);
      setPreview({ batch, report });
    } catch (failure) {
      setPreview(null);
      setError(
        failure instanceof Error
          ? failure.message
          : "This file is not a supported vocabulary export.",
      );
    }
  };
  const commit = async () => {
    if (!preview || saving) return;
    setSaving(true);
    setError("");
    try {
      if (!pending.current) {
        const draft = structuredClone(fb.stateRef.current);
        const previousIds = new Set(
          (draft.vocabularyImportBatches || []).map((batch) => batch.id),
        );
        const result = mergeVocabularyImport(draft, preview.batch);
        if (result?.invalid) {
          setError(result.reason || "Import validation failed.");
          setSaving(false);
          return;
        }
        const inserted = (draft.vocabularyImportBatches || []).find(
          (batch) => !previousIds.has(batch.id),
        );
        const batchId =
          preview.batch.id ||
          result?.batchId ||
          result?.batch?.id ||
          inserted?.id;
        if (!batchId) {
          setError("This export has already been imported.");
          setSaving(false);
          return;
        }
        pending.current = { draft, batchId };
      }
      if (
        await fb.persistVocabularyImport(
          pending.current.draft,
          pending.current.batchId,
        )
      ) {
        fb.closeModal();
        fb.toast("Vocabulary import saved.");
        pending.current = null;
      } else
        setError("Import could not be saved. Retry to save this same batch.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Import could not be saved. Retry to save this same batch.",
      );
    }
    setSaving(false);
  };
  const counts = preview?.report?.counts || preview?.report || {};
  const reportFields = [
    ["matched", "Matched entries"],
    ["imported", "New entries"],
    ["duplicated", "Duplicates"],
    ["missingEnrichment", "Enrichment pending"],
    ["manualReviewRequired", "Manual review"],
    ["invalid", "Invalid records"],
  ];
  return (
    <ModalFrame
      open={open}
      title="Import vocabulary"
      onClose={() => {
        if (!saving) fb.closeModal();
      }}
    >
      <div className="modal vocabulary-modal">
        <h3>Import vocabulary</h3>
        <div className="vocabulary-import-file">
          <label htmlFor="vocabulary-import-file">JSON or CSV export</label>
          <input
            ref={fileInput}
            id="vocabulary-import-file"
            type="file"
            accept=".json,.csv,application/json,text/csv"
            hidden
            disabled={saving}
            onChange={readFile}
          />
          <div className="vocabulary-file-picker"><button type="button" className="btn line" disabled={saving} onClick={()=>fileInput.current?.click()}><Upload size={15}/>{text ? 'Change file' : 'Choose file'}</button><span aria-live="polite">{text ? filename : 'No file selected'}</span></div>
          <a href="/guixue-exporter.js" className="btn line" download>
            <Download size={15} />
            Guixue exporter
          </a>
        </div>
        <label htmlFor="vocabulary-import-text">Export contents</label>
        <textarea
          id="vocabulary-import-text"
          className="vocabulary-import-text"
          value={text}
          disabled={saving}
          onChange={(event) => {
            setText(event.target.value);
            resetPreview();
          }}
          spellCheck={false}
        />
        <div className="actions">
          <button
            className="btn line"
            type="button"
            disabled={!text.trim() || saving}
            onClick={inspect}
          >
            <Eye size={16} />
            Preview import
          </button>
        </div>
        {preview ? (
          <>
            <div className="vocabulary-import-report">
              {reportFields.map(([key, title]) => (
                <div key={key}>
                  {title}
                  <strong>{counts[key] || 0}</strong>
                </div>
              ))}
            </div>
            {preview.report?.warnings?.length ? (
              <div className="vocabulary-import-footnote">
                {preview.report.warnings.map((warning, index) => (
                  <p key={index}>
                    {typeof warning === "string"
                      ? warning
                      : warning.reason || warning.message}
                  </p>
                ))}
              </div>
            ) : null}
            <div className="vocabulary-import-preview">
              {(preview.batch.entries || preview.batch.records || [])
                .slice(0, 12)
                .map((item, index) => (
                  <div key={item.id || index}>
                    <strong>
                      {item.term || item.word || "Unmatched record"}
                    </strong>
                    <span>{item.status || item.manualStatus || ""}</span>
                  </div>
                ))}
            </div>
          </>
        ) : null}
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
          <button
            className="btn primary"
            type="button"
            disabled={!preview || saving}
            onClick={commit}
          >
            <Upload size={16} />
            {saving
              ? "Saving import..."
              : error && pending.current
                ? "Retry import"
                : "Import vocabulary"}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
