// @ts-nocheck
import { useEffect, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';

export function LexiconModal() {
  const fb = useFieldbook();
  const open = fb.modal === 'lexicon';
  const seed = fb.lexiconSeed || {};
  const editing = fb.editingLexiconId
    ? fb.state.lexicon.find((item) => item.id === fb.editingLexiconId)
    : null;
  const [category, setCategory] = useState('word');
  const [term, setTerm] = useState('');
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [tags, setTags] = useState('');
  const [skill, setSkill] = useState('writing');
  const [source, setSource] = useState('');

  useEffect(() => {
    if (!open) return;
    const item = editing || seed;
    setCategory(item.category || 'word');
    setTerm(item.term || '');
    setMeaning(item.meaning || '');
    setExample(item.example || '');
    setTags(Array.isArray(item.tags) ? item.tags.join('；') : item.tags || '');
    setSkill(item.skill || fb.activeSkill);
    setSource(item.source || '');
  }, [open, editing, seed, fb.activeSkill]);

  if (!open) return null;

  return (
    <div className="modal-bg show" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && fb.closeModal()}>
      <div className="modal lexicon-modal">
        <h3>{editing ? 'Edit phrase' : 'Add a phrase'}</h3>
        <p>
          {skill === 'speaking'
            ? 'Something you can use next time you speak.'
            : 'Something you can use next time you write.'}
        </p>
        <div className="form">
          <div className="field">
            <label htmlFor="lexiconItemCategory">Type</label>
            <select id="lexiconItemCategory" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="word">Word</option>
              <option value="phrase">Phrase</option>
              <option value="sentence">Pattern</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="lexiconItemTerm">Phrase</label>
            <input id="lexiconItemTerm" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="For example: account for" />
          </div>
          <div className="field full">
            <label htmlFor="lexiconItemMeaning">Meaning</label>
            <input
              id="lexiconItemMeaning"
              value={meaning}
              onChange={(e) => setMeaning(e.target.value)}
              placeholder="Meaning, limit, or a collocation"
            />
          </div>
          <div className="field full">
            <label htmlFor="lexiconItemExample">Example</label>
            <textarea
              id="lexiconItemExample"
              value={example}
              onChange={(e) => setExample(e.target.value)}
              placeholder="An example you could use in an IELTS answer"
            />
          </div>
          <div className="field">
            <label htmlFor="lexiconItemTags">Tags</label>
            <input id="lexiconItemTags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Task 1; trend; link" />
          </div>
          <div className="field">
            <label htmlFor="lexiconItemSkill">Skill</label>
            <select id="lexiconItemSkill" value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="writing">Writing</option>
              <option value="speaking">Speaking</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="lexiconItemSource">Source</label>
            <input
              id="lexiconItemSource"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Question number or score file"
            />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn line" type="button" onClick={() => fb.closeModal()}>
            Cancel
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              const draft = structuredClone(fb.stateRef.current);
              const input = {
                category,
                term,
                meaning,
                example,
                tags,
                source,
                skill: skill === 'speaking' ? 'speaking' : 'writing',
              };
              if (fb.editingLexiconId) {
                const updated = fb.updateLexiconItem(draft, fb.editingLexiconId, input);
                if (!updated) {
                  fb.toast('The phrase cannot be empty, and it cannot duplicate one you already saved.');
                  return;
                }
                fb.closeModal();
                fb.persistNow(draft);
                fb.toast('Phrase updated.');
              } else {
                const result = fb.addLexiconItem(draft, input);
                if (result.invalid) {
                  fb.toast(result.reason);
                  return;
                }
                fb.closeModal();
                fb.persistNow(draft);
                fb.toast(result.duplicate ? 'You already saved this one.' : 'Saved.');
              }
              fb.setEditingLexiconId(null);
              fb.setLexiconSeed(null);
            }}
          >
            Save phrase
          </button>
        </div>
      </div>
    </div>
  );
}
