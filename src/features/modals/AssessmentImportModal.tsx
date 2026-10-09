// @ts-nocheck
import { useRef, useState } from 'react';
import { FileUp, ClipboardPaste } from 'lucide-react';
import { ModalFrame } from '../../components/ModalFrame';
import { useFieldbook } from '../../context/FieldbookContext';

export function AssessmentImportModal() {
  const fb = useFieldbook();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = fb.modal === 'assessment';
  const submit = async (content: string, filename = 'pasted-score.md') => {
    if (!content.trim()) { fb.toast('Paste a marked score or choose a Markdown file.'); return; }
    setBusy(true);
    let result;
    try { result = await fb.importFeedback(content, filename); } catch { setError('Could not import feedback. Your text is still here.'); setBusy(false); return; }
    setBusy(false);
    if (result.invalid) { setError(result.reason); return; }
    if (!result.saved) { setError('Could not save feedback to your account. Retry when your connection returns.'); return; }
    setError('');
    setText('');
    fb.closeModal();
    fb.navigate(result.assessment ? `/review/${result.assessment.id}` : '/review');
    fb.toast(result.duplicate ? 'This feedback is already saved.' : result.updatedPlan ? 'Feedback imported. Your next practice is ready.' : 'Feedback imported.');
  };
  return <ModalFrame open={open} onClose={() => fb.closeModal()} title="Import feedback"><div className="modal feedback-import-modal">
    <div className="modal-heading"><div><span className="eyebrow">Feedback</span><h3>Bring in your score</h3></div><span className="modal-icon"><ClipboardPaste size={19} /></span></div>
    <p>Paste the Markdown returned by your marker, or upload the score file Fieldbook exported.</p>
    <textarea aria-label="Marked score" className="feedback-paste" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the marked score here…" />
    {error ? <p className="inline-error" role="alert">{error}</p> : null}
    <div className="feedback-import-actions"><button className="btn line" type="button" disabled={busy} onClick={() => input.current?.click()}><FileUp size={16} />Choose file</button><input ref={input} type="file" accept=".md,.txt,text/markdown,text/plain" hidden onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { setText(String(reader.result)); void submit(String(reader.result), file.name); }; reader.onerror = () => setError('Could not read that file. Choose it again.'); reader.readAsText(file); e.target.value = ''; }} /><button className="btn primary" type="button" disabled={busy} onClick={() => void submit(text)}>{busy ? 'Importing…' : 'Import feedback'}</button></div>
  </div></ModalFrame>;
}
