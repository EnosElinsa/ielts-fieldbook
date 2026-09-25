// @ts-nocheck
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { speakingCoverage } from '../../domain';
import { useFieldbook } from '../../context/FieldbookContext';
import { coverageClass, coverageLabel } from '../../lib/format';
import { Empty, FilterMenu } from '../../components/ui';

function SampleBlock({ topic, part }) {
  const wanted = String(part || topic.part);
  const hint = (
    <p className="file-hint">A sample for shape, not for memorising. A Part 2 answer is about one or two minutes.</p>
  );
  if (wanted === '1') {
    const items = (topic.questions || [])
      .map((question, index) => {
        const answer = (topic.samples || [])[index];
        return answer ? (
          <div className="sample-qa" key={index}>
            <strong>
              {index + 1}. {question}
            </strong>
            <p>{answer}</p>
          </div>
        ) : null;
      })
      .filter(Boolean);
    if (!items.length) return null;
    return (
      <details className="sample-answers">
        <summary>Show a sample answer</summary>
        {hint}
        {items}
      </details>
    );
  }
  if (wanted === '3') {
    const items = (topic.part3 || [])
      .map((question, index) => {
        const answer = (topic.part3Samples || [])[index];
        return answer ? (
          <div className="sample-qa" key={index}>
            <strong>
              {index + 1}. {question}
            </strong>
            <p>{answer}</p>
          </div>
        ) : null;
      })
      .filter(Boolean);
    if (!items.length) return null;
    return (
      <details className="sample-answers">
        <summary>Show Part 3 samples</summary>
        {hint}
        {items}
      </details>
    );
  }
  if (!topic.sampleAnswer && !(topic.sampleNotes && topic.sampleNotes.length)) return null;
  return (
    <details className="sample-answers">
      <summary>Show a sample answer</summary>
      {hint}
      {topic.sampleNotes && topic.sampleNotes.length ? (
        <div className="sample-qa">
          <strong>Sample one-minute notes</strong>
          <ul>
            {topic.sampleNotes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {topic.sampleAnswer ? (
        <div className="sample-qa">
          <strong>Sample one-to-two-minute answer</strong>
          <p>{topic.sampleAnswer}</p>
        </div>
      ) : null}
    </details>
  );
}

export function SpeakingTopicPage() {
  const { id } = useParams();
  const fb = useFieldbook();
  const navigate = useNavigate();
  const [attachStoryId, setAttachStoryId] = useState('');
  const topic =
    fb.state.speakingTopics.find((t) => String(t.id) === String(id)) ||
    fb.selectedTopic ||
    null;

  if (!topic) {
    return (
      <section className="view active">
        <Empty message="The speaking bank did not load." />
        <Link className="btn line" to="/speak/questions">
          ← Back to questions
        </Link>
      </section>
    );
  }

  const statusValue = speakingCoverage(fb.state, topic.id);
  const draft = fb.speakingDraft(topic.id);
  const stories = (fb.state.stories || []).filter((story) => (story.topicIds || []).includes(topic.id));

  return (
    <section className="view active">
      <div className="page-tools">
        <p>
          {coverageLabel(statusValue)}
          {topic.incomplete ? ' · incomplete' : ''}
        </p>
        <Link className="btn line" to="/speak/questions">
          ← Back to questions
        </Link>
      </div>
      <div className="split">
        <div className="panel">
          <span className={`pill ${Number(topic.part) === 1 ? 'blue' : 'red'}`}>Part {topic.part}</span>{' '}
          <span className={`pill ${coverageClass(statusValue)}`}>{coverageLabel(statusValue)}</span>
          {topic.incomplete ? <span className="pill"> Incomplete</span> : null}
          {Number(topic.part) === 1 ? (
            <ol className="prompt-body">
              {(topic.questions || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          ) : (
            <>
              <div className="cue-card">
                <strong>{topic.cueCard || topic.title}</strong>
                {topic.bullets && topic.bullets.length ? (
                  <ul>
                    {topic.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {topic.part3 && topic.part3.length ? (
                <>
                  <h4 className="mt-16">Part 3</h4>
                  <ol className="prompt-body">
                    {topic.part3.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </>
              ) : null}
            </>
          )}
          <SampleBlock topic={topic} />
          {Number(topic.part) === 2 ? <SampleBlock topic={topic} part="3" /> : null}
          <p className="file-hint">Candidates reported this topic. It is not an official paper. No recording.</p>
        </div>
        <div className="panel">
          <h3>Stories</h3>
          {stories.length ? (
            stories.map((story) => (
              <div className="linked-story" key={story.id}>
                <h4>{story.title || 'Untitled story'}</h4>
                <p>{[story.people, story.place, story.time].filter(Boolean).join(' · ') || 'No notes yet'}</p>
                <div className="topic-actions">
                  <button
                    className="btn line"
                    type="button"
                    onClick={() => {
                      fb.setEditingStoryId(story.id);
                      fb.setStoryPresetTopicIds([]);
                      fb.openModal('story');
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => fb.startSpeakingPractice(topic.id, '2', story.id)}
                  >
                    Practise with this
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty">No story for this topic yet.</div>
          )}
          <div className="topic-actions">
            <FilterMenu
              label="Story to attach"
              value={attachStoryId}
              onChange={setAttachStoryId}
              options={
                (fb.state.stories || []).length
                  ? (fb.state.stories || []).map((story) => ({
                      value: story.id,
                      label: story.title || 'Untitled story',
                    }))
                  : [{ value: '', label: 'No stories yet' }]
              }
            />
            <button
              className="btn line"
              type="button"
              disabled={!fb.state.stories.length}
              onClick={() => {
                if (!attachStoryId) {
                  fb.toast('Choose a story first.');
                  return;
                }
                const draftState = structuredClone(fb.stateRef.current);
                const story = (draftState.stories || []).find((item) => item.id === attachStoryId);
                if (!story) return;
                fb.updateStory(draftState, story.id, {
                  topicIds: Array.from(new Set((story.topicIds || []).concat([topic.id]))),
                });
                fb.persistNow(draftState);
                fb.toast('Added to this topic.');
              }}
            >
              Add to this topic
            </button>
            <button
              className="btn line"
              type="button"
              onClick={() => {
                fb.setEditingStoryId(null);
                fb.setStoryPresetTopicIds([topic.id]);
                fb.openModal('story');
              }}
            >
              Write one for this topic
            </button>
          </div>
          <h3 className="mt-22">Notes</h3>
          <textarea
            className="notes-area"
            placeholder="Notes for this question"
            value={draft.notes}
            onChange={(e) => {
              fb.setSpeakingDraft(topic.id, { notes: e.target.value });
              fb.scheduleDraftPersist();
            }}
          />
          <div className="topic-actions">
            {Number(topic.part) === 1 ? (
              <button className="btn primary" type="button" onClick={() => fb.startSpeakingPractice(topic.id, '1')}>
                Practise Part 1
              </button>
            ) : (
              <>
                <button className="btn primary" type="button" onClick={() => fb.startSpeakingPractice(topic.id, '2')}>
                  Practise Part 2
                </button>
                <button className="btn line" type="button" onClick={() => fb.startSpeakingPractice(topic.id, '3')}>
                  Practise Part 3
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
