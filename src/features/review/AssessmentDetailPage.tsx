// @ts-nocheck
import { Link, useParams } from 'react-router-dom';
import { reconstructAssessmentMarkdown } from '../../domain';
import { useFieldbook } from '../../context/FieldbookContext';
import { formatDate, lexiconLabels, markdownLines, sessionSkill } from '../../lib/format';

function Lines({ text }: { text: string }) {
  return (
    <>
      {markdownLines(text).map((line, index) => (
        <span key={index}>
          {line}
          {index < markdownLines(text).length - 1 ? <br /> : null}
        </span>
      ))}
    </>
  );
}

export function AssessmentDetailPage() {
  const { id } = useParams();
  const fb = useFieldbook();
  const assessment = fb.state.assessments.find((item) => item.id === id);
  if (!assessment) {
    return (
      <section className="view active">
        <div className="empty">
          <p>Score not found.</p>
          <Link className="btn line" to="/review">
            ← Back to review
          </Link>
        </div>
      </section>
    );
  }
  const session = assessment.sessionId ? fb.state.sessions.find((item) => item.id === assessment.sessionId) : null;
  const estimated =
    assessment.inventedPronunciation ||
    (assessment.criteria || []).some((item) => /pronunciation/i.test(item.name) && /unscored/i.test(item.score));
  const skillAttr =
    assessment.skill === 'speaking' || (session && session.skill === 'speaking') ? 'speaking' : 'writing';

  const quickLexicon = (seed) => {
    fb.setEditingLexiconId(null);
    fb.setLexiconSeed(seed);
    fb.openModal('lexicon');
  };

  return (
    <section className="view active">
      <div className="assessment-page">
        <div className="assessment-page-head">
          <div>
            <p className="kicker">Score</p>
            <h2>Score report</h2>
            <p>
              {assessment.overall
                ? `Overall ${assessment.overall}${estimated ? ' · estimated, no audio' : ''} · `
                : ''}
              {formatDate(assessment.date, true)}
            </p>
          </div>
          <Link className="btn line" to="/review">
            ← Back to review
          </Link>
        </div>
        <div className="assessment-page-layout">
          <article className="assessment-main">
            <div className="assessment-summary">
              {assessment.inventedPronunciation ? (
                <p className="file-hint warn-note">
                  The file gave a pronunciation score, but there is no audio, so that number was left out.
                </p>
              ) : null}
              {assessment.summary ? (
                <div className="assessment-section">
                  <p>
                    <Lines text={assessment.summary} />
                  </p>
                </div>
              ) : null}
            </div>
            <section className="assessment-section">
              <h4>Four criteria</h4>
              <div className="criteria-grid">
                {(assessment.criteria || []).map((criterion, index) => {
                  const unscored =
                    /pronunciation/i.test(criterion.name) &&
                    (/unscored/i.test(criterion.score) || assessment.inventedPronunciation);
                  return (
                    <div className="criteria-card" key={index}>
                      <strong>{criterion.name}</strong>
                      <span>{unscored ? 'Not scored (no audio)' : `Band ${criterion.score}`}</span>
                      <p>{criterion.evidence}</p>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="assessment-section">
              <h4>Main problems</h4>
              <div>
                {assessment.priorities ? (
                  <p>
                    <Lines text={assessment.priorities} />
                  </p>
                ) : (
                  <p>Nothing recorded.</p>
                )}
              </div>
            </section>
            <section className="assessment-section">
              <h4>Edits</h4>
              <div>
                {assessment.editRows && assessment.editRows.length ? (
                  <div className="edit-table-wrap">
                    <table className="edit-table">
                      <thead>
                        <tr>
                          <th>Original</th>
                          <th>Revision</th>
                          <th>Why</th>
                          <th>Tag</th>
                          <th>Save</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assessment.editRows.map((row, index) => (
                          <tr key={index}>
                            <td>{row.original}</td>
                            <td>{row.revised}</td>
                            <td>{row.reason}</td>
                            <td>
                              <span className="pill red">{row.tag}</span>
                            </td>
                            <td>
                              <button
                                className="btn line"
                                type="button"
                                onClick={() =>
                                  quickLexicon({
                                    category: 'phrase',
                                    term: row.revised,
                                    meaning: row.reason,
                                    source: assessment.filename,
                                    skill: skillAttr,
                                  })
                                }
                              >
                                Add
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : assessment.editNotes ? (
                  <pre>{assessment.editNotes}</pre>
                ) : (
                  <p>This score file has no line-by-line edits.</p>
                )}
              </div>
            </section>
            <section className="assessment-section">
              <h4>Full rewrite</h4>
              <div>
                {assessment.rewrittenResponse ? (
                  <>
                    {assessment.rewriteTooShort ? (
                      <p className="file-hint warn-note">
                        The rewrite is only {assessment.rewriteWordCount} words, under the{' '}
                        {assessment.task === 'Task 2' ? 250 : 150}-word minimum, so it is not a full exam answer. Ask
                        for the score again.
                      </p>
                    ) : null}
                    <pre>{assessment.rewrittenResponse}</pre>
                  </>
                ) : assessment.rewriteExample ? (
                  <>
                    <p className="file-hint">
                      This is a short sample from an older score file, not a full rewrite. Request a new score.
                    </p>
                    <pre>{assessment.rewriteExample}</pre>
                  </>
                ) : (
                  <p>This score file has no full rewrite.</p>
                )}
              </div>
            </section>
            <section className="assessment-section">
              <h4>Phrases to keep</h4>
              <div>
                {assessment.lexiconSuggestions && assessment.lexiconSuggestions.length ? (
                  <div className="lexicon-tags">
                    {assessment.lexiconSuggestions.map((item, index) => (
                      <div className="lexicon-suggestion" key={index}>
                        <div>
                          <span className="pill blue">{lexiconLabels[item.category] || 'Phrase'}</span>
                          <strong>{item.term}</strong>
                          <p>{item.meaning}</p>
                          {item.example ? <small>{item.example}</small> : null}
                        </div>
                        <button
                          className="btn line"
                          type="button"
                          onClick={() =>
                            quickLexicon({
                              category: item.category,
                              term: item.term,
                              meaning: item.meaning,
                              example: item.example,
                              tags: (item.tags || []).join('; '),
                              source: assessment.filename,
                              skill: skillAttr,
                            })
                          }
                        >
                          Save
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>This score has no phrases worth keeping.</p>
                )}
              </div>
            </section>
            <section className="assessment-section">
              <h4>Next practice</h4>
              <div>
                {assessment.nextExercise ? (
                  <p>
                    <Lines text={assessment.nextExercise} />
                  </p>
                ) : (
                  <p>Nothing recorded.</p>
                )}
              </div>
            </section>
          </article>
          <aside className="assessment-aside">
            <section>
              <h4>Your script</h4>
              <pre className="history-copy">
                {session
                  ? session.essay
                  : assessment.skill === 'speaking' || (session && sessionSkill(session) === 'speaking')
                    ? 'This score has no transcript to show.'
                    : 'This score has no essay to show.'}
              </pre>
            </section>
            <details className="raw-details">
              <summary>Show the original score file</summary>
              <pre>{assessment.rawText || reconstructAssessmentMarkdown(assessment)}</pre>
            </details>
          </aside>
        </div>
      </div>
    </section>
  );
}
