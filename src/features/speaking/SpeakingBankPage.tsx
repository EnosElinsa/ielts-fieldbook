// @ts-nocheck
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { speakingCoverage } from '../../domain';
import { useFieldbook } from '../../context/FieldbookContext';
import { coverageClass, coverageLabel, safeSource } from '../../lib/format';
import { Empty, FilterMenu } from '../../components/ui';

function topicPreview(topic) {
  if (Number(topic.part) === 1) return (topic.questions || []).slice(0, 2).join(' / ') || topic.title;
  return topic.cueCard || (topic.questions || [])[0] || topic.title;
}

export function SpeakingBankPage() {
  const fb = useFieldbook();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [part, setPart] = useState('all');
  const [filter, setFilter] = useState('all');
  const topics = fb.state.speakingTopics || [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return topics.filter((topic) => {
      const haystack =
        `${topic.title} ${topic.cueCard || ''} ${(topic.questions || []).join(' ')} ${(topic.part3 || []).join(' ')}`.toLowerCase();
      const statusValue = speakingCoverage(fb.state, topic.id);
      return (
        (part === 'all' || String(topic.part) === part) &&
        (filter === 'all' || statusValue === filter) &&
        (!q || haystack.includes(q))
      );
    });
  }, [topics, search, part, filter, fb.state]);

  const counts = { unseen: 0, prepared: 0, practiced: 0, assessed: 0 };
  topics.forEach((topic) => {
    counts[speakingCoverage(fb.state, topic.id)] += 1;
  });

  const groups = [
    { part: 1, title: 'Part 1', items: filtered.filter((topic) => Number(topic.part) === 1) },
    { part: 2, title: 'Part 2', items: filtered.filter((topic) => Number(topic.part) === 2) },
  ].filter((group) => part === 'all' || String(group.part) === part);

  return (
    <section className="view active">
      <div className="page-tools">
        <p>
          {topics.length} topics. Not seen {counts.unseen}, has a story {counts.prepared}, practised{' '}
          {counts.practiced}, marked {counts.assessed}.
        </p>
      </div>
      <div className="toolbar">
        <input
          className="search"
          aria-label="Search speaking topics"
          placeholder="Search a topic…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FilterMenu
          label="Part"
          value={part}
          onChange={setPart}
          options={[
            { value: 'all', label: 'All parts' },
            { value: '1', label: 'Part 1' },
            { value: '2', label: 'Part 2' },
          ]}
        />
        <FilterMenu
          label="Progress"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Any progress' },
            { value: 'unseen', label: 'Not seen' },
            { value: 'prepared', label: 'Has a story' },
            { value: 'practiced', label: 'Practised' },
            { value: 'assessed', label: 'Marked' },
          ]}
        />
      </div>
      <div>
        {groups.length ? (
          groups.map((group) => (
            <div className="speak-board" key={group.part}>
              <h3>
                {group.title} · {group.items.length}
              </h3>
              <div className="questions">
                {group.items.length ? (
                  group.items.map((topic) => {
                    const statusValue = speakingCoverage(fb.state, topic.id);
                    return (
                      <article className="q-card speak" key={topic.id}>
                        <div className="q-top">
                          <span className={`pill ${Number(topic.part) === 1 ? 'blue' : 'red'}`}>
                            Part {topic.part}
                          </span>
                          <span className={`pill ${coverageClass(statusValue)}`}>{coverageLabel(statusValue)}</span>
                        </div>
                        <h4>{topic.title}</h4>
                        <p>{topicPreview(topic)}</p>
                        {topic.incomplete ? <p className="file-hint">Some questions for this topic are still missing.</p> : null}
                        <div className="q-bottom">
                          <button
                            className="btn primary"
                            type="button"
                            onClick={() => {
                              fb.setSelectedTopicId(String(topic.id));
                              fb.setDeskPart(String(topic.part || '2'));
                              navigate(`/speak/topics/${topic.id}`);
                            }}
                          >
                            Open
                          </button>
                          <a
                            className="source"
                            href={safeSource(topic.source)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Source ↗
                          </a>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <Empty
                    message="No topics match."
                    label="Clear filters"
                    onAction={() => {
                      setSearch('');
                      setPart('all');
                      setFilter('all');
                    }}
                  />
                )}
              </div>
            </div>
          ))
        ) : (
          <Empty message="The speaking bank did not load. Check that local/speaking-questions.json is present, then refresh." />
        )}
      </div>
    </section>
  );
}
