// @ts-nocheck
import { useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Star, List, LayoutGrid, ExternalLink, PenLine } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { chartLabels, displayName, formatLabel, safeImage, safeSource, typeName } from '../../lib/format';
import { Empty, FilterMenu } from '../../components/ui';

export function WritingBankPage() {
  const fb = useFieldbook();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') || '';
  const task = params.get('task') || 'all';
  const format = params.get('format') || 'all';
  const progress = params.get('progress') || 'all';
  const sort = params.get('sort') || 'catalog';
  const view = params.get('view') === 'list' ? 'list' : 'grid';
  const update = (key, value) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value && value !== 'all' && value !== 'catalog' && value !== 'grid') next.set(key, value);
    else next.delete(key);
    return next;
  }, { replace: true });
  const practiced = new Set(fb.state.sessions.filter((session) => session.skill !== 'speaking').map((session) => String(session.questionId)));
  const favorites = new Set(fb.state.settings.favoriteQuestions || []);
  useEffect(() => {
    const key = `fieldbook:bank-scroll:writing:${params.toString()}`;
    const previous = Number(sessionStorage.getItem(key) || 0);
    const frame = requestAnimationFrame(() => window.scrollTo(0, previous));
    return () => { cancelAnimationFrame(frame); sessionStorage.setItem(key, String(window.scrollY)); };
  }, [params.toString()]);
  const questions = useMemo(() => {
    const q = search.toLowerCase();
    return fb.state.questions.filter(
      (question) =>
        (task === 'all' || question.type === task) &&
        (format === 'all' || question.format === format) &&
        (progress === 'all' || (progress === 'practiced' && practiced.has(String(question.id))) || (progress === 'unpracticed' && !practiced.has(String(question.id))) || (progress === 'favorites' && favorites.has(`writing:${question.id}`))) &&
        (!q || `${question.name} ${question.prompt}`.toLowerCase().includes(q)),
    ).slice().sort((a, b) => sort === 'title' ? String(a.name).localeCompare(String(b.name), undefined, { numeric: true }) : 0);
  }, [fb.state, search, task, format, progress, sort]);

  return (
    <section className="view active">
      <div className="page-tools">
        <p>{questions.length === 1 ? '1 question' : `${questions.length} questions`}</p>
      </div>
      <div className="toolbar">
        <input
          className="search"
          aria-label="Search writing questions"
          placeholder="Search a number, topic, or the question…"
          value={search}
          onChange={(e) => update('q', e.target.value)}
        />
        <FilterMenu
          label="Task"
          value={task}
          onChange={(value) => update('task', value)}
          options={[
            { value: 'all', label: 'All tasks' },
            { value: '1', label: 'Task 1' },
            { value: '2', label: 'Task 2' },
          ]}
        />
        <FilterMenu
          label="Chart type"
          value={format}
          onChange={(value) => update('format', value)}
          options={[
            { value: 'all', label: 'All types' },
            ...Object.entries(chartLabels).map(([value, label]) => ({ value, label })),
          ]}
        />
        <FilterMenu label="Practice status" value={progress} onChange={(value) => update('progress', value)} options={[
          { value: 'all', label: 'Any progress' }, { value: 'unpracticed', label: 'Not practised' },
          { value: 'practiced', label: 'Practised' }, { value: 'favorites', label: 'Favourites' },
        ]} />
        <FilterMenu label="Sort questions" value={sort} onChange={(value) => update('sort', value)} options={[
          { value: 'catalog', label: 'Catalog order' }, { value: 'title', label: 'Title A-Z' },
        ]} />
        <div className="bank-view-toggle" role="group" aria-label="Question layout">
          <button type="button" className="btn line icon-btn" aria-label="Grid view" title="Grid view" aria-pressed={view === 'grid'} onClick={() => update('view', 'grid')}><LayoutGrid size={16} /></button>
          <button type="button" className="btn line icon-btn" aria-label="List view" title="List view" aria-pressed={view === 'list'} onClick={() => update('view', 'list')}><List size={16} /></button>
        </div>
      </div>
      <div className={`questions${view === 'list' ? ' questions-list' : ''}`}>
        {questions.length ? (
          questions.map((question) => {
            const image = safeImage(question.image);
            const prompt =
              question.prompt.length > 175 ? `${question.prompt.slice(0, 175)}…` : question.prompt;
            return (
              <article className="q-card" key={question.id}>
                <div className="q-top">
                  <span className={`pill ${question.type === '1' ? 'blue' : 'red'}`}>{typeName(question)}</span>
                  <span className="date">{formatLabel(question.format)}</span>
                  <button type="button" className="btn text icon-btn" aria-label={`${favorites.has(`writing:${question.id}`) ? 'Remove' : 'Add'} favourite: ${displayName(question.name)}`} title="Favourite question" aria-pressed={favorites.has(`writing:${question.id}`)} onClick={() => fb.toggleFavorite(question.id, 'writing')}><Star size={17} fill={favorites.has(`writing:${question.id}`) ? 'currentColor' : 'none'} /></button>
                </div>
                <h4>{displayName(question.name)}</h4>
                {image ? <img src={image} alt={`${displayName(question.name)} chart`} loading="lazy" /> : null}
                <p>{prompt}</p>
                <div className="q-bottom">
                  <button className="btn primary" type="button" onClick={() => fb.chooseQuestion(question.id)}>
                    <PenLine size={15} /> Write this
                  </button>
                  <a className="source" href={safeSource(question.source)} target="_blank" rel="noopener noreferrer">
                    Source <ExternalLink size={13} />
                  </a>
                </div>
              </article>
            );
          })
        ) : fb.state.questions.length ? (
          <Empty
            message="No questions match."
            label="Clear filters"
            onAction={() => {
              setParams({});
            }}
          />
        ) : (
          <Empty message="The question bank did not load. Sign in again after the question catalog has been seeded." />
        )}
      </div>
    </section>
  );
}
