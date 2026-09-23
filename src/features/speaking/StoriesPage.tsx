// @ts-nocheck
import { useMemo, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { formatDate } from '../../lib/format';
import { Empty } from '../../components/ui';

function storySummary(story) {
  return [
    story.people && `People: ${story.people}`,
    story.place && `Place: ${story.place}`,
    story.time && `When: ${story.time}`,
    story.feeling && `Felt: ${story.feeling}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function StoriesPage() {
  const fb = useFieldbook();
  const [search, setSearch] = useState('');
  const items = useMemo(() => {
    const q = search.toLowerCase();
    return (fb.state.stories || []).filter((story) => {
      const haystack =
        `${story.title} ${story.people} ${story.place} ${story.time} ${story.event} ${story.feeling} ${(story.tags || []).join(' ')}`.toLowerCase();
      return !q || haystack.includes(q);
    });
  }, [fb.state.stories, search]);

  return (
    <section className="view active">
      <div className="section-head">
        <div>
          <p className="kicker">Stories</p>
          <h3>Things that happened to you</h3>
          <p>A few real stories. The same one can cover more than one Part 2.</p>
        </div>
        <button
          className="btn primary"
          type="button"
          onClick={() => {
            fb.setEditingStoryId(null);
            fb.setStoryPresetTopicIds([]);
            fb.openModal('story');
          }}
        >
          Write a story
        </button>
      </div>
      <div className="toolbar">
        <input
          className="search"
          aria-label="Search stories"
          placeholder="Search people, places, or tags…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="lexicon-list">
        {items.length ? (
          items.map((story) => {
            const names = (story.topicIds || []).map((id) => {
              const topic = fb.state.speakingTopics.find((t) => String(t.id) === String(id));
              return topic ? topic.title : id;
            });
            return (
              <article className="lexicon-card" key={story.id}>
                <div className="lexicon-card-head">
                  <div>
                    <span className="pill blue">Fits {(story.topicIds || []).length} topics</span>
                    <h4 className="lexicon-term">{story.title || 'Untitled story'}</h4>
                    <p className="lexicon-meaning">{storySummary(story) || 'No notes yet'}</p>
                  </div>
                </div>
                {story.event ? <p className="lexicon-example">{story.event}</p> : null}
                <div className="lexicon-tags">
                  {names.map((name) => (
                    <span className="pill" key={name}>
                      {name}
                    </span>
                  ))}
                </div>
                <div className="lexicon-card-foot">
                  <span className="lexicon-meta">{formatDate(story.updatedAt || story.createdAt)}</span>
                  <div className="lexicon-actions">
                    <button
                      className="btn line"
                      type="button"
                      onClick={() => {
                        const topicId = (story.topicIds || [])[0];
                        if (!topicId) {
                          fb.setEditingStoryId(story.id);
                          fb.openModal('story');
                          fb.toast('Choose a Part 2 topic first.');
                          return;
                        }
                        fb.startSpeakingPractice(topicId, '2', story.id);
                      }}
                    >
                      Practise
                    </button>
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
                      className="btn line"
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete “${story.title}”?`)) {
                          const draft = structuredClone(fb.stateRef.current);
                          fb.removeStory(draft, story.id);
                          fb.persistNow(draft);
                          fb.toast('Story deleted.');
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <Empty
            message="No stories yet."
            label="Write a story"
            onAction={() => {
              fb.setEditingStoryId(null);
              fb.setStoryPresetTopicIds([]);
              fb.openModal('story');
            }}
          />
        )}
      </div>
    </section>
  );
}
