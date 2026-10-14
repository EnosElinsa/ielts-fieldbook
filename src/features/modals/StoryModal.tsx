// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { ModalFrame } from '../../components/ModalFrame';
import { SaveFailure } from '../../components/SaveFailure';
import { accountId } from '../../storage/remote';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false); const mounted = useRef(true);
  const pendingId = useRef<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!open) return;
    setError('');
    pendingId.current = null;
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
  }, [open, editing?.id, fb.storyPresetTopicIds]);

  const save = async () => {
    if (lock.current) return;
    if (!title.trim()) { setError('Give the story a title first.'); return; }
    const owner = accountId(); const editingId = fb.editingStoryId;
    lock.current = true; setSaving(true); setError('');
    let feedback = '';
    try {
      const draft = structuredClone(fb.stateRef.current);
      const input = { title, people, place, time, event, feeling, tags, topicIds };
      const storyId = editingId || pendingId.current;
      if (storyId && draft.stories.some(row => row.id === storyId)) fb.updateStory(draft, storyId, input);
      else {
        pendingId.current ||= crypto.randomUUID();
        fb.addStory(draft, input, { id: () => pendingId.current });
      }
      if (!editingId) fb.completeStoriesPlan(draft);
      const saved = await fb.persistNow(draft, { collections: ['stories', 'plans', 'profile'], onError: message => { feedback = message; } });
      if (!mounted.current || accountId() !== owner) return;
      if (!saved) { setError(feedback || 'Story could not be saved. Your changes are still here. Retry saving.'); return; }
      fb.setEditingStoryId(null); fb.closeModal(); fb.toast(editingId ? 'Story updated.' : 'Story saved.');
    } catch {
      if (mounted.current && accountId() === owner) setError('Story could not be saved. Your changes are still here. Retry saving.');
    } finally {
      lock.current = false; if (mounted.current && accountId() === owner) setSaving(false);
    }
  };

  return (
    <ModalFrame open={open} title={editing ? 'Edit this story' : 'Write a story'} busy={saving} onClose={() => fb.closeModal()}>
      <div className="modal story-modal">
        <h3 aria-hidden="true">{editing ? 'Edit this story' : 'Write a story'}</h3>
        <p>Who, where, when, and what happened.</p>
        <fieldset className="form" disabled={saving}>
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
                    <span>{topic.title}</span>
                  </label>
                ))
              ) : (
                <div className="empty">The speaking bank did not load.</div>
              )}
            </div>
          </div>
        </fieldset>
        <SaveFailure failed={Boolean(error)} role="alert" message={error} />
        <div className="modal-foot">
          <button className="btn line" type="button" disabled={saving} onClick={() => fb.closeModal()}>
            Cancel
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
