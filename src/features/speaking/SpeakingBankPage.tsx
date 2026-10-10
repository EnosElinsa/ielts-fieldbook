// @ts-nocheck
import { useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Star, List, LayoutGrid, ArrowUpRight } from 'lucide-react';
import { speakingCoverage } from '../../domain';
import { useFieldbook } from '../../context/FieldbookContext';
import { coverageClass, coverageLabel } from '../../lib/format';
import { Empty, FilterMenu } from '../../components/ui';

function topicPreview(topic) {
  if (Number(topic.part) === 1) return (topic.questions || []).slice(0, 2).join(' / ') || topic.title;
  return topic.cueCard || (topic.questions || [])[0] || topic.title;
}

export function SpeakingBankPage() {
  const fb = useFieldbook();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') || '';
  const part = params.get('part') || 'all';
  const filter = params.get('progress') || 'all';
  const sort = params.get('sort') || 'catalog';
  const view = params.get('view') === 'list' ? 'list' : 'grid';
  const favorites = new Set(fb.state.settings.favoriteQuestions || []);
  const update = (key, value) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value && value !== 'all' && value !== 'catalog' && value !== 'grid') next.set(key, value);
    else next.delete(key);
    return next;
  }, { replace: true });
  useEffect(() => {
    const key = `fieldbook:bank-scroll:speaking:${params.toString()}`;
    const previous = Number(sessionStorage.getItem(key) || 0);
    const frame = requestAnimationFrame(() => window.scrollTo(0, previous));
    return () => { cancelAnimationFrame(frame); sessionStorage.setItem(key, String(window.scrollY)); };
  }, [params.toString()]);
  const topics = fb.state.speakingTopics || [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return topics.filter((topic) => {
      const haystack =
        `${topic.title} ${topic.cueCard || ''} ${(topic.questions || []).join(' ')} ${(topic.part3 || []).join(' ')}`.toLowerCase();
      const statusValue = speakingCoverage(fb.state, topic.id);
      return (
        (part === 'all' || String(topic.part) === part) &&
        (filter === 'all' || statusValue === filter || (filter === 'favorites' && favorites.has(`speaking:${topic.id}`))) &&
        (!q || haystack.includes(q))
      );
    }).slice().sort((a, b) => sort === 'title' ? String(a.title).localeCompare(String(b.title)) : 0);
  }, [topics, search, part, filter, fb.state, sort]);

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
          onChange={(e) => update('q', e.target.value)}
        />
        <FilterMenu
          label="Part"
          value={part}
          onChange={(value) => update('part', value)}
          options={[
            { value: 'all', label: 'All parts' },
            { value: '1', label: 'Part 1' },
            { value: '2', label: 'Part 2' },
          ]}
        />
        <FilterMenu
          label="Progress"
          value={filter}
          onChange={(value) => update('progress', value)}
          options={[
            { value: 'all', label: 'Any progress' },
            { value: 'unseen', label: 'Not seen' },
            { value: 'prepared', label: 'Has a story' },
            { value: 'practiced', label: 'Practised' },
            { value: 'assessed', label: 'Marked' },
            { value: 'favorites', label: 'Favourites' },
          ]}
        />
        <FilterMenu label="Sort topics" value={sort} onChange={(value) => update('sort', value)} options={[{ value: 'catalog', label: 'Catalog order' }, { value: 'title', label: 'Title A-Z' }]} />
        <div className="bank-view-toggle" role="group" aria-label="Topic layout">
          <button type="button" className="btn line icon-btn" aria-label="Grid view" title="Grid view" aria-pressed={view === 'grid'} onClick={() => update('view', 'grid')}><LayoutGrid size={16} /></button>
          <button type="button" className="btn line icon-btn" aria-label="List view" title="List view" aria-pressed={view === 'list'} onClick={() => update('view', 'list')}><List size={16} /></button>
        </div>
      </div>
      <div>
        {groups.length ? (
          groups.map((group) => (
            <div className="speak-board" key={group.part}>
              <h3>
                {group.title} · {group.items.length}
              </h3>
              <div className={`questions${view === 'list' ? ' questions-list' : ''}`}>
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
                          <button type="button" className="btn text icon-btn" aria-label={`${favorites.has(`speaking:${topic.id}`) ? 'Remove' : 'Add'} favourite: ${topic.title}`} title="Favourite topic" aria-pressed={favorites.has(`speaking:${topic.id}`)} onClick={() => fb.toggleFavorite(topic.id, 'speaking')}><Star size={17} fill={favorites.has(`speaking:${topic.id}`) ? 'currentColor' : 'none'} /></button>
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
                            Open <ArrowUpRight size={15} />
                          </button>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <Empty
                    message="No topics match."
                    label="Clear filters"
                    onAction={() => {
                      setParams({});
                    }}
                  />
                )}
              </div>
            </div>
          ))
        ) : (
          <Empty message="The speaking bank did not load. Sign in again after the question catalog has been seeded." />
        )}
      </div>
    </section>
  );
}
