// @ts-nocheck
import { useMemo, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { formatDate } from '../../lib/format';
import { Empty } from '../../components/ui';
import { FilterMenu } from '../../components/ui';
import { ArrowUpRight, Pencil, Plus, Trash2 } from 'lucide-react';

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
  const [tag, setTag] = useState('all');
  const [topic, setTopic] = useState('all');
  const tags = [...new Set((fb.state.stories || []).flatMap((story) => story.tags || []))].sort();
  const linkedTopics = fb.state.speakingTopics.filter((entry) => fb.state.stories.some((story) => (story.topicIds || []).map(String).includes(String(entry.id))));
  const items = useMemo(() => {
    const q = search.toLowerCase();
    return (fb.state.stories || []).filter((story) => {
      const haystack =
        `${story.title} ${story.people} ${story.place} ${story.time} ${story.event} ${story.feeling} ${(story.tags || []).join(' ')}`.toLowerCase();
      return (!q || haystack.includes(q)) && (tag === 'all' || (story.tags || []).includes(tag)) && (topic === 'all' || (story.topicIds || []).map(String).includes(topic));
    });
  }, [fb.state.stories, search, tag, topic]);

  return (
    <section className="view active">
      <div className="page-tools">
        <p>A few real stories. The same one can cover more than one Part 2.</p>
        <button
          className="btn primary"
          type="button"
          onClick={() => {
            fb.setEditingStoryId(null);
            fb.setStoryPresetTopicIds([]);
            fb.openModal('story');
          }}
        >
          <Plus size={16} /> Write a story
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
        <FilterMenu label="Story theme" value={tag} onChange={setTag} options={[{ value: 'all', label: 'All themes' }, ...tags.map((value) => ({ value, label: value }))]} />
        <FilterMenu label="Linked topic" value={topic} onChange={setTopic} options={[{ value: 'all', label: 'All topics' }, ...linkedTopics.map((entry) => ({ value: String(entry.id), label: entry.title }))]} />
      </div>
      <div className="story-list">
        {items.length ? (
          items.map((story) => {
            const names = (story.topicIds || []).map((id) => {
              const topic = fb.state.speakingTopics.find((t) => String(t.id) === String(id));
              return topic ? topic.title : id;
            });
            return (
              <article className="story-card" key={story.id}>
                <div className="story-card-head">
                  <div>
                    <span className="pill blue">Fits {(story.topicIds || []).length} topics</span>
                    <h4 className="story-term">{story.title || 'Untitled story'}</h4>
                    <p className="story-meaning">{storySummary(story) || 'No notes yet'}</p>
                  </div>
                </div>
                {story.event ? <p className="story-example">{story.event}</p> : null}
                <div className="story-tags">
                  {names.map((name, index) => (
                    <button type="button" className="story-topic-link" key={`${name}-${index}`} onClick={() => fb.startSpeakingPractice(story.topicIds[index], '2', story.id)}>{name}<ArrowUpRight size={13} /></button>
                  ))}
                </div>
                <div className="story-card-foot">
                  <span className="story-meta">{formatDate(story.updatedAt || story.createdAt)}</span>
                  <div className="story-actions">
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
                      Practise <ArrowUpRight size={15} />
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
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      className="btn line"
                      type="button"
                      onClick={async () => {
                        if (window.confirm(`Delete “${story.title}”?`)) {
                          const draft = structuredClone(fb.stateRef.current);
                          fb.removeStory(draft, story.id);
                          if (await fb.persistNow(draft)) fb.toast('Story deleted.');
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
        ) : (
          <Empty
            message={fb.state.stories.length ? 'No stories match your filters.' : 'No stories yet.'}
            label={fb.state.stories.length ? 'Clear filters' : 'Write a story'}
            onAction={() => {
              if (fb.state.stories.length) { setSearch(''); setTag('all'); setTopic('all'); return; }
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
