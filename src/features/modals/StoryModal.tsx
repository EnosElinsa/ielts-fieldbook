// @ts-nocheck
import { useEffect, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';

export function StoryModal() {
  const fb = useFieldbook();
  const open = fb.modal === 'story';
  const editing = fb.editingStoryId
    ? (fb.state.stories || []).find((item) => item.id === fb.editingStoryId)
    : null;
  const part2 = (fb.state.speakingTopics || []).filter((topic) => Number(topic.part) === 2);
  const [title, setTitle] = useState('');
  const [people, setPeople] = useState('');
  const [place, setPlace] = useState('');
  const [time, setTime] = useState('');
  const [event, setEvent] = useState('');
  const [feeling, setFeeling] = useState('');
  const [tags, setTags] = useState('');
  const [topicIds, setTopicIds] = useState([]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title || '');
      setPeople(editing.people || '');
      setPlace(editing.place || '');
      setTime(editing.time || '');
      setEvent(editing.event || '');
      setFeeling(editing.feeling || '');
      setTags((editing.tags || []).join('；'));
      setTopicIds(editing.topicIds || []);
    } else {
      setTitle('');
      setPeople('');
      setPlace('');
      setTime('');
      setEvent('');
      setFeeling('');
      setTags('');
      setTopicIds(fb.storyPresetTopicIds || []);
    }
  }, [open, editing, fb.storyPresetTopicIds]);

  if (!open) return null;

  return (
    <div className="modal-bg show" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && fb.closeModal()}>
      <div className="modal lexicon-modal">
        <h3>{editing ? 'Edit this story' : 'Write a story'}</h3>
        <p>Who, where, when, and what happened.</p>
        <div className="form">
          <div className="field full">
            <label htmlFor="storyTitle">Title</label>
            <input
              id="storyTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="For example: finishing an essay in the library"
            />
          </div>
          <div className="field">
            <label htmlFor="storyPeople">People</label>
            <input id="storyPeople" value={people} onChange={(e) => setPeople(e.target.value)} placeholder="A classmate, family, yourself" />
          </div>
          <div className="field">
            <label htmlFor="storyPlace">Place</label>
            <input id="storyPlace" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="School, a street, home" />
          </div>
          <div className="field">
            <label htmlFor="storyTime">When</label>
            <input id="storyTime" value={time} onChange={(e) => setTime(e.target.value)} placeholder="Last summer, last week" />
          </div>
          <div className="field full">
            <label htmlFor="storyEvent">What happened</label>
            <textarea
              id="storyEvent"
              className="notes-area"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              placeholder="What happened, and what you did"
            />
          </div>
          <div className="field full">
            <label htmlFor="storyFeeling">How you felt</label>
            <input
              id="storyFeeling"
              value={feeling}
              onChange={(e) => setFeeling(e.target.value)}
              placeholder="Nervous, proud, surprised"
            />
          </div>
          <div className="field full">
            <label htmlFor="storyTags">Tags</label>
            <input id="storyTags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="school; travel; friends" />
          </div>
          <div className="field full">
            <label>Which Part 2 topics</label>
            <div className="story-topics">
              {part2.length ? (
                part2.map((topic) => (
                  <label key={topic.id}>
                    <input
                      type="checkbox"
                      value={topic.id}
                      checked={topicIds.map(String).includes(String(topic.id))}
                      onChange={(e) => {
                        setTopicIds((prev) =>
                          e.target.checked
                            ? [...prev, topic.id]
                            : prev.filter((id) => String(id) !== String(topic.id)),
                        );
                      }}
                    />
                    <span>
                      {topic.title}
                      {topic.titleZh ? ` · ${topic.titleZh}` : ''}
                    </span>
                  </label>
                ))
              ) : (
                <div className="empty">The speaking bank did not load.</div>
              )}
            </div>
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
              if (!String(title || '').trim()) {
                fb.toast('Give the story a title first.');
                return;
              }
              const draft = structuredClone(fb.stateRef.current);
              const input = { title, people, place, time, event, feeling, tags, topicIds };
              if (fb.editingStoryId) {
                fb.updateStory(draft, fb.editingStoryId, input);
                fb.closeModal();
                fb.persistNow(draft);
                fb.toast('Story updated.');
              } else {
                const added = fb.addStory(draft, input, { id: () => crypto.randomUUID() });
                if (added.item && !added.duplicate) fb.completeStoriesPlan(draft);
                fb.closeModal();
                fb.persistNow(draft);
                fb.toast('Story saved.');
              }
              fb.setEditingStoryId(null);
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
