// @ts-nocheck
import { useMemo, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import {
  lexiconItemSkill,
  lexiconLabels,
  lexiconStatusLabels,
} from '../../lib/format';
import { Empty, FilterMenu } from '../../components/ui';
import { lexiconSentenceMatches } from '../../domain';
import { Check, Eye, Pencil, Plus, Trash2, X } from 'lucide-react';

function lexiconIsDue(item) {
  return !item.nextReviewAt || new Date(item.nextReviewAt) <= new Date();
}

function lexiconDate(value) {
  if (!value) return 'Due today';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Due today'
    : `Review ${date.getDate()} ${date.toLocaleString('en-GB', { month: 'short' })}`;
}

export function LexiconPage() {
  const fb = useFieldbook();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [skill, setSkill] = useState('all');
  const [guesses, setGuesses] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [study, setStudy] = useState(false);
  const [studyIndex, setStudyIndex] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return fb.state.lexicon
      .slice()
      .sort((a, b) => {
        const due = Number(lexiconIsDue(b)) - Number(lexiconIsDue(a));
        return due || new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
      })
      .filter((item) => {
        const haystack = `${item.term} ${item.meaning} ${item.example} ${(item.tags || []).join(' ')}`.toLocaleLowerCase();
        return (
          (!q || haystack.includes(q)) &&
          (category === 'all' || item.category === category) &&
          (status === 'all' || item.status === status) &&
          (skill === 'all' || lexiconItemSkill(item) === skill) &&
          (!fb.lexiconDueOnly || lexiconIsDue(item))
        );
      });
  }, [fb.state.lexicon, search, category, status, skill, fb.lexiconDueOnly]);

  const due = fb.state.lexicon.filter(lexiconIsDue).length;
  const mastered = fb.state.lexicon.filter((item) => item.status === 'mastered').length;
  const studyItems = filtered.filter(lexiconIsDue);
  const visibleItems = study ? studyItems.slice(Math.min(studyIndex, Math.max(0, studyItems.length - 1)), Math.min(studyIndex, Math.max(0, studyItems.length - 1)) + 1) : filtered;
  const bulkStatus = async (status) => {
    const draft = structuredClone(fb.stateRef.current);
    draft.lexicon.forEach((item) => { if (selected.has(item.id)) { item.status = status; item.updatedAt = new Date().toISOString(); } });
    if (await fb.persistNow(draft)) { setSelected(new Set()); fb.toast('Selected phrases updated.'); }
  };
  const activePlan = fb.state.plans.find(
    (item) => item.id === fb.state.activePlanId && item.kind === 'lexicon' && item.status === 'in_progress',
  );

  return (
    <section className="view active">
      <div className="page-tools">
        <p>Keep the language from a score that you want to use again.</p>
        <div className="actions">
          {activePlan ? (
            <button
              className="btn line"
              type="button"
              onClick={() => {
                const draft = structuredClone(fb.stateRef.current);
                const plan = fb.completeLexiconPlan(draft, fb.lexiconDueAtVisit);
                if (plan) {
                  fb.persistNow(draft);
                  fb.toast('Phrase review done.');
                } else fb.toast('Finish the due phrases first, or check that none are left.');
              }}
            >
              Finish this review
            </button>
          ) : null}
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              fb.setEditingLexiconId(null);
              fb.setLexiconSeed({ skill: fb.activeSkill });
              fb.openModal('lexicon');
            }}
          >
            <Plus size={16} /> Add a phrase
          </button>
        </div>
      </div>
      <div className="toolbar">
        <input
          className="search"
          aria-label="Search phrases"
          placeholder="Search a phrase, meaning, example, or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FilterMenu
          label="Type"
          value={category}
          onChange={setCategory}
          options={[
            { value: 'all', label: 'All types' },
            { value: 'word', label: 'Word' },
            { value: 'phrase', label: 'Phrase' },
            { value: 'sentence', label: 'Pattern' },
          ]}
        />
        <FilterMenu
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Any status' },
            { value: 'new', label: 'New' },
            { value: 'learning', label: 'Learning' },
            { value: 'mastered', label: 'Known' },
          ]}
        />
        <FilterMenu
          label="Skill"
          value={skill}
          onChange={setSkill}
          options={[
            { value: 'all', label: 'Both skills' },
            { value: 'writing', label: 'Writing' },
            { value: 'speaking', label: 'Speaking' },
          ]}
        />
        <button
          className={`btn ${fb.lexiconDueOnly ? 'primary' : 'line'}`}
          type="button"
          onClick={() => fb.setLexiconDueOnly(!fb.lexiconDueOnly)}
        >
          {fb.lexiconDueOnly ? 'Show all' : 'Due today'}
        </button>
      </div>
      <div className="lexicon-stats">
        <div className="lexicon-stat">
          <strong>{fb.state.lexicon.length}</strong> saved
        </div>
        <div className="lexicon-stat">
          <strong>{due}</strong> due
        </div>
        <div className="lexicon-stat">
          <strong>{mastered}</strong> known
        </div>
      </div>
      <div className="phrase-study-tools">
        <button type="button" className={`btn ${study ? 'primary' : 'line'}`} disabled={!study && !studyItems.length} onClick={() => { setStudy(!study); setStudyIndex(0); setSelected(new Set()); }}><Eye size={16} />{study ? 'Exit review' : `Review due phrases (${studyItems.length})`}</button>
        {study ? <span>{studyItems.length ? 'Current due phrase' : 'All phrases reviewed'}</span> : <label className="phrase-select-all"><input type="checkbox" checked={filtered.length > 0 && filtered.every((item) => selected.has(item.id))} onChange={(event) => setSelected(event.target.checked ? new Set(filtered.map((item) => item.id)) : new Set())} />Select visible</label>}
        {selected.size ? <><span>{selected.size} selected</span><button className="btn line" type="button" onClick={() => bulkStatus('learning')}>Set learning</button><button className="btn line" type="button" onClick={() => bulkStatus('mastered')}><Check size={15} /> Set known</button><button className="btn text icon-btn" type="button" aria-label="Clear selection" title="Clear selection" onClick={() => setSelected(new Set())}><X size={16} /></button></> : null}
      </div>
      <div className="lexicon-list">
        {visibleItems.length ? (
          visibleItems.map((item) => {
            const revealed = Boolean(fb.revealedLexicon[item.id]);
            const sentence = item.category === 'sentence';
            const isDue = lexiconIsDue(item);
            const hideAnswer = isDue && !revealed;
            return (
              <article className={`lexicon-card${isDue ? ' is-due' : ''}`} key={item.id}>
                <div className="lexicon-card-head">
                  {!study ? <input type="checkbox" aria-label={`Select ${item.term}`} checked={selected.has(item.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} /> : null}
                  <div>
                    <span className={`pill ${item.category === 'sentence' ? 'red' : item.category === 'phrase' ? 'blue' : ''}`}>
                      {lexiconLabels[item.category]}
                    </span>{' '}
                    <span className={`pill${lexiconItemSkill(item) === 'speaking' ? ' green' : ''}`}>
                      {lexiconItemSkill(item) === 'speaking' ? 'Speaking' : 'Writing'}
                    </span>
                    {sentence && hideAnswer ? (
                      <h4 className="lexicon-term">Write the pattern first</h4>
                    ) : (
                      <h4 className="lexicon-term">{item.term}</h4>
                    )}
                    {!hideAnswer ? (
                      <p className="lexicon-meaning">{item.meaning || 'No meaning yet'}</p>
                    ) : null}
                  </div>
                  <span className={`pill ${item.status === 'mastered' ? 'green' : isDue ? 'red' : ''}`}>
                    {lexiconStatusLabels[item.status]}
                  </span>
                </div>
                {!hideAnswer && item.example ? <p className="lexicon-example">{item.example}</p> : null}
                {sentence && hideAnswer ? (
                  <div className="lexicon-guess">
                    <input
                      className="search"
                      placeholder="Write the pattern"
                      aria-label={`Recall pattern: ${item.meaning || item.term}`}
                      value={guesses[item.id] || ''}
                      onChange={(e) => setGuesses((g) => ({ ...g, [item.id]: e.target.value }))}
                    />
                    <button
                      className="btn line"
                      type="button"
                      onClick={() => {
                        const draft = structuredClone(fb.stateRef.current);
                        const ok = lexiconSentenceMatches(item.term, guesses[item.id]);
                        fb.reviewLexiconItem(draft, item.id, ok ? 'good' : 'again');
                        fb.setRevealedLexicon((r) => ({ ...r, [item.id]: true }));
                        fb.persistNow(draft);
                        fb.toast(ok ? 'That matches.' : 'Back in 1 day.');
                      }}
                    >
                      Check
                    </button>
                  </div>
                ) : null}
                <div className="lexicon-tags">
                  {(item.tags || []).map((tag) => (
                    <span className="pill" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="lexicon-card-foot">
                  <span className="lexicon-meta">
                    {isDue ? 'Due today' : lexiconDate(item.nextReviewAt)} · reviewed {item.reviewCount || 0}
                    {item.source ? ` · ${item.source}` : ''}
                  </span>
                  <div className="lexicon-actions">
                    {isDue && !sentence && revealed ? (
                      <>
                        {['again', 'good', 'easy'].map((grade) => (
                          <button
                            key={grade}
                            className={`btn ${grade === 'easy' ? 'primary' : 'line'}`}
                            type="button"
                            onClick={async () => {
                              const draft = structuredClone(fb.stateRef.current);
                              fb.reviewLexiconItem(draft, item.id, grade);
                              fb.setRevealedLexicon((r) => ({ ...r, [item.id]: true }));
                              const saved = await fb.persistNow(draft);
                              if (!saved) return;
                              fb.toast(
                                grade === 'again'
                                  ? 'Back in 1 day.'
                                  : grade === 'easy'
                                    ? 'This one can wait longer.'
                                    : 'Saved. It will come back in a few days.',
                              );
                            }}
                          >
                            {grade === 'again' ? 'Forgot' : grade === 'good' ? 'I knew it' : 'Too easy'}
                          </button>
                        ))}
                      </>
                    ) : !revealed && !sentence ? (
                      <button
                        className="btn line"
                        type="button"
                        onClick={() => fb.setRevealedLexicon((r) => ({ ...r, [item.id]: true }))}
                      >
                        Show meaning
                      </button>
                    ) : null}
                    <button
                      className="btn line"
                      type="button"
                      onClick={() => {
                        fb.setEditingLexiconId(item.id);
                        fb.setLexiconSeed(item);
                        fb.openModal('lexicon');
                      }}
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      className="btn line"
                      type="button"
                      onClick={async () => {
                        if (window.confirm(`Delete “${item.term}”?`)) {
                          const draft = structuredClone(fb.stateRef.current);
                          fb.removeLexiconItem(draft, item.id);
                          if (await fb.persistNow(draft)) fb.toast('Phrase deleted.');
                        }
                      }}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        ) : fb.state.lexicon.length ? (
          <Empty
            message={study ? 'All due phrases have been reviewed.' : 'Nothing matches.'}
            label="Clear filters"
            onAction={() => {
              setSearch('');
              setCategory('all');
              setStatus('all');
              setSkill('all');
              fb.setLexiconDueOnly(false);
              setStudy(false);
            }}
          />
        ) : (
          <Empty
            message="Nothing saved yet. Keep the phrases from a score that you want to use again."
            label="Add one"
            onAction={() => {
              fb.setEditingLexiconId(null);
              fb.setLexiconSeed({ skill: fb.activeSkill });
              fb.openModal('lexicon');
            }}
          />
        )}
      </div>
    </section>
  );
}
