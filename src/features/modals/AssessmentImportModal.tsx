// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { FileUp, ClipboardPaste } from 'lucide-react';
import { ModalFrame } from '../../components/ModalFrame';
import { useFieldbook } from '../../context/FieldbookContext';
import { accountId } from '../../storage/remote';

export function AssessmentImportModal() {
  const fb = useFieldbook();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filename, setFilename] = useState('pasted-score.md');
  const busyRef = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const open = fb.modal === 'assessment';
  const submit = async (content: string, sourceName = filename) => {
    if (busyRef.current) return;
    if (!content.trim()) { setError('Paste feedback or choose a marked feedback file.'); return; }
    const owner = accountId();
    busyRef.current = true; setBusy(true); setError('');
    let result;
    try { result = await fb.importFeedback(content, sourceName); }
    catch { if (alive.current && owner === accountId()) setError('Could not import feedback. Your text is still here.'); return; }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
    if (!alive.current || owner !== accountId()) return;
    if (result.invalid) { setError(result.reason); return; }
    if (!result.saved) { setError('Could not save feedback to your account. Retry when your connection returns.'); return; }
    setError('');
    setText('');
    fb.closeModal();
    fb.navigate(result.assessment ? `/review/${result.assessment.id}` : '/review');
    fb.toast(result.duplicate ? 'This feedback is already saved.' : result.updatedPlan ? 'Feedback imported. Your next practice is ready.' : 'Feedback imported.');
  };
  const readFile = (file: File) => {
    if (busyRef.current) return;
    const owner = accountId();
    const reader = new FileReader();
    busyRef.current = true; setBusy(true); setError('');
    reader.onload = () => {
      busyRef.current = false;
      if (!alive.current || owner !== accountId()) return;
      const content = String(reader.result);
      setText(content); setFilename(file.name); setBusy(false);
      void submit(content, file.name);
    };
    reader.onerror = () => { busyRef.current = false; if (alive.current && owner === accountId()) { setBusy(false); setError('Could not read that file. Choose it again.'); } };
    reader.readAsText(file);
  };
  return <ModalFrame open={open} busy={busy} onClose={() => fb.closeModal()} title="Import feedback"><div className="modal feedback-import-modal">
    <div className="modal-heading"><div><span className="eyebrow">Feedback</span><h3>Import feedback</h3></div><span className="modal-icon"><ClipboardPaste size={19} /></span></div>
    <p>Paste the completed Markdown feedback from your marker, or upload the marked file.</p>
    <textarea aria-label="Feedback text" className="feedback-paste" disabled={busy} value={text} onChange={(e) => { setText(e.target.value); setError(''); }} placeholder="Paste the completed feedback here…" />
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
    <div className="feedback-import-actions"><button className="btn line" type="button" disabled={busy} onClick={() => input.current?.click()}><FileUp size={16} />Choose file</button><input ref={input} type="file" accept=".md,.txt,text/markdown,text/plain" hidden disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) readFile(file); e.target.value = ''; }} /><button className="btn primary" type="button" disabled={busy} onClick={() => void submit(text)}>{busy ? 'Importing...' : error ? 'Retry import' : 'Import feedback'}</button></div>
  </div></ModalFrame>;
}
