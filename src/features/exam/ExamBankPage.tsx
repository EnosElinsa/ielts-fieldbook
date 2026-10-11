import { useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Star, ArrowRight } from 'lucide-react';
import { useFieldbook } from '../../context/FieldbookContext';
import { FilterMenu } from '../../components/ui';
import type { ExamAttempt, ExamSkill, QuestionType } from '../../domain/exam/types';
import { QUESTION_TYPE_NAMES, useExamCatalog } from './useExamCatalog';
import '../../styles/exam.css';

const PAPERS_PER_PAGE = 8;

export function ExamBankPage({ skill }: { skill: ExamSkill }) {
  const fb = useFieldbook();
  const [params, setParams] = useSearchParams();
  const [saveError, setSaveError] = useState('');
  const [failedFavorite, setFailedFavorite] = useState<{ id: string; wanted: boolean } | null>(null);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const favoriteLock = useRef(false);
  const results = useRef<HTMLDivElement>(null);
  const intensive = skill === 'listening' && params.get('mode') === 'intensive';
  const sectionLabel = skill === 'reading' ? 'Passage' : 'Part';
  const book = params.get('book') || 'all';
  const test = params.get('test') || 'all';
  const part = params.get('part') || 'all';
  const type = params.get('type') || 'all';
  const status = params.get('status') || 'all';
  const search = params.get('q') || '';
  const { catalog, loading, error, reload } = useExamCatalog(skill, book === 'all' ? undefined : Number(book));
  const attempts = (fb.state.examAttempts || []) as ExamAttempt[];
  const favorites = new Set<string>(fb.state.settings.favoriteExamSectionIds || []);
  const update = (key: string, value: string) => setParams(current => {
    const next = new URLSearchParams(current);
    if (value && value !== 'all') next.set(key, value); else next.delete(key);
    next.delete('page');
    return next;
  }, { replace: true });
  const clearFilters = () => setParams(intensive ? { mode: 'intensive' } : {});
  const hasFilters = [book, test, part, type, status].some(value => value !== 'all') || Boolean(search);
  const papers = useMemo(() => catalog.papers.filter(paper => (book === 'all' || paper.book === Number(book)) && (test === 'all' || paper.test === Number(test))).sort((a, b) => a.book - b.book || a.test - b.test), [catalog, book, test]);
  const paperById = new Map(papers.map(paper => [paper.id, paper]));
  const practised = new Set(attempts.filter(attempt => attempt.status === 'completed').flatMap(attempt => attempt.sectionIds));
  const sections = catalog.sections.filter(section => {
    const paper = paperById.get(section.paperId);
    if (!paper || section.skill !== skill) return false;
    const haystack = `${section.title} ${paper.title} Cambridge ${paper.book} Test ${paper.test} ${sectionLabel} ${section.part}`.toLowerCase();
    return (part === 'all' || section.part === Number(part))
      && (type === 'all' || section.questionTypes.includes(type as QuestionType))
      && search.toLowerCase().trim().split(/\s+/).every(word => haystack.includes(word))
      && (status === 'all' || (status === 'ready' && section.status === 'ready') || (status === 'incomplete' && section.status !== 'ready') || (status === 'favorites' && favorites.has(section.id)) || (status === 'practised' && practised.has(section.id)) || (status === 'new' && !practised.has(section.id)));
  });
  const matchingPapers = papers.filter(paper => sections.some(section => section.paperId === paper.id));
  const pageCount = Math.max(1, Math.ceil(matchingPapers.length / PAPERS_PER_PAGE));
  const requestedPage = Number(params.get('page') || 1);
  const page = Math.min(pageCount, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const visiblePapers = matchingPapers.slice((page - 1) * PAPERS_PER_PAGE, page * PAPERS_PER_PAGE);
  const changePage = (nextPage: number) => {
    setParams(current => { const next = new URLSearchParams(current); if (nextPage === 1) next.delete('page'); else next.set('page', String(nextPage)); return next; });
    results.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  };
  const toggleFavorite = async (id: string, wanted = !favorites.has(id)) => {
    if (favoriteLock.current) return;
    favoriteLock.current = true;
    setSavingFavorite(true);
    try {
      const draft = structuredClone(fb.stateRef.current);
      const next = new Set<string>(draft.settings.favoriteExamSectionIds || []);
      if (wanted) next.add(id); else next.delete(id);
      draft.settings.favoriteExamSectionIds = [...next];
      if (await fb.persistNow(draft)) { setSaveError(''); setFailedFavorite(null); }
      else { setSaveError('Could not save your favourite.'); setFailedFavorite({ id, wanted }); }
    } catch { setSaveError('Could not save your favourite.'); setFailedFavorite({ id, wanted }); }
    finally { favoriteLock.current = false; setSavingFavorite(false); }
  };
  const recent = attempts.filter(attempt => attempt.skill === skill).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
  return <section className="view active exam-bank">
    <div className="exam-intro">
      <span className="exam-eyebrow">Cambridge 8–21 · {skill}</span>
      <h2>{intensive ? 'Listen closer, sentence by sentence.' : skill === 'reading' ? 'Find the evidence. Build your accuracy.' : 'Listen with a purpose. Practise with a method.'}</h2>
      <p>{intensive ? 'Choose a part for blind listening, dictation, comparison, shadowing and delayed review.' : skill === 'reading' ? 'Practise a passage with evidence and method notes, or take a complete test under exam conditions.' : 'Practise a part, revisit your mistakes with intensive listening, or take a complete test under exam conditions.'}</p>
    </div>
    <div className="toolbar exam-toolbar">
      <input className="search" value={search} onChange={event => update('q', event.target.value)} aria-label={`Search ${skill} sections`} placeholder="Search a title, book or test…" />
      <FilterMenu label="Book" value={book} onChange={value => update('book', value)} options={[{ value: 'all', label: 'All books' }, ...Array.from({ length: 14 }, (_, index) => ({ value: String(index + 8), label: `Cambridge ${index + 8}` }))]} />
      <FilterMenu label="Test" value={test} onChange={value => update('test', value)} options={[{ value: 'all', label: 'All tests' }, ...[1, 2, 3, 4].map(value => ({ value: String(value), label: `Test ${value}` }))]} />
      <FilterMenu label={sectionLabel} value={part} onChange={value => update('part', value)} options={[{ value: 'all', label: `All ${sectionLabel.toLowerCase()}s` }, ...Array.from({ length: skill === 'reading' ? 3 : 4 }, (_, index) => ({ value: String(index + 1), label: `${sectionLabel} ${index + 1}` }))]} />
      <FilterMenu label="Question type" value={type} onChange={value => update('type', value)} options={[{ value: 'all', label: 'All question types' }, ...Object.entries(QUESTION_TYPE_NAMES).map(([value, label]) => ({ value, label }))]} />
      <FilterMenu label="Practice status" value={status} onChange={value => update('status', value)} options={[{ value: 'all', label: 'Any status' }, { value: 'ready', label: 'Ready' }, { value: 'incomplete', label: 'Source incomplete' }, { value: 'new', label: 'Not practised' }, { value: 'practised', label: 'Practised' }, { value: 'favorites', label: 'Favourites' }]} />
    </div>
    {saveError && <div role="alert" className="exam-notice">{saveError} {failedFavorite && <button className="btn line" disabled={savingFavorite} onClick={() => void toggleFavorite(failedFavorite.id, failedFavorite.wanted)}>Retry favourite save</button>}</div>}
    {recent.length > 0 && <aside className="exam-recent"><span className="exam-eyebrow">Your recent work</span>{recent.map(attempt => <Link key={attempt.id} to={attempt.status === 'completed' ? `/${skill}/review/${attempt.id}` : attempt.mode === 'mock' ? `/${skill}/mock/${attempt.sourceId}?attempt=${attempt.id}` : `/${skill}/${attempt.sectionIds[0]}?attempt=${attempt.id}${attempt.retryOfAttemptId ? `&retry=${encodeURIComponent(attempt.retryOfAttemptId)}` : ''}`}>
      <span>{catalog.sections.find(section => section.id === attempt.sectionIds[0])?.title || attempt.sourceId}</span>
      <span>{attempt.mode === 'mock' ? 'Full mock' : `${sectionLabel} practice`} · {attempt.status === 'completed' ? `${attempt.score} / ${attempt.total}` : 'In progress'}</span><b>{attempt.status === 'completed' ? 'Review' : 'Resume'} <ArrowRight size={14} /></b>
    </Link>)}</aside>}
    {loading ? <p className="empty" role="status">Loading source catalog…</p> : error ? <div className="empty"><p role="alert">{error}</p><button className="btn line" onClick={reload}>Retry loading</button></div> : !catalog.sections.some(section => section.skill === skill) ? <div className="exam-empty"><h3>The {skill} bank is not available yet.</h3><p>Verified source content for Cambridge 8–21 has not been imported. No sample answers or passages are substituted here.</p></div> : <>
      <div className="exam-results-bar" ref={results}><span role="status">{matchingPapers.length} test{matchingPapers.length === 1 ? '' : 's'} · {sections.length} {sectionLabel.toLowerCase()}{sections.length === 1 ? '' : 's'}</span>{hasFilters && <button className="btn text" onClick={clearFilters}>Clear filters</button>}</div>
      {sections.length === 0 ? <div className="empty"><p>No sections match these filters.</p></div> : <div className="exam-paper-list">{visiblePapers.map(paper => {
        const all = catalog.sections.filter(section => section.paperId === paper.id && section.skill === skill);
        const complete = all.length === (skill === 'reading' ? 3 : 4) && all.every(section => section.status === 'ready' && section.questionCount > 0);
        return <article className="exam-paper" key={paper.id}>
          <header><div><span className="exam-eyebrow">Cambridge {paper.book} / Test {paper.test}</span><h3>{paper.title}</h3></div>{complete ? <Link className="btn line" to={`/${skill}/mock/${paper.id}`}>Full mock <ArrowRight size={15} /></Link> : <button className="btn line" disabled aria-label="Full mock unavailable">Full mock unavailable</button>}</header>
          <div className={`exam-section-grid exam-section-grid-${skill}`}>{sections.filter(section => section.paperId === paper.id).sort((a, b) => a.part - b.part).map(section => <div className="exam-section-card" key={section.id}>
            <div className="exam-section-top"><span className="pill blue">{sectionLabel} {section.part}</span><button className="btn text icon-btn" aria-label={`${favorites.has(section.id) ? 'Remove' : 'Add'} favourite: ${section.title}`} aria-pressed={favorites.has(section.id)} disabled={savingFavorite} onClick={() => void toggleFavorite(section.id)}><Star size={17} fill={favorites.has(section.id) ? 'currentColor' : 'none'} /></button></div>
            <h4>{section.title}</h4><p>{section.questionCount} questions · {section.questionTypes.map(value => QUESTION_TYPE_NAMES[value]).join(' · ')}</p>
            {section.status === 'ready' ? <div className="btn-row"><Link className={`btn ${intensive ? 'line' : 'primary'}`} to={`/${skill}/${section.id}`}>Practise part {section.part} <ArrowRight size={15} /></Link>{skill === 'listening' && <Link className={`btn ${intensive ? 'primary' : 'line'}`} to={`/listening/intensive/${section.id}`}>Open intensive part {section.part}</Link>}</div> : <div className="exam-source-status">Source incomplete · practice unavailable</div>}
          </div>)}</div>
          {!complete && <p className="exam-source-foot">A full mock opens when every {sectionLabel.toLowerCase()} and its source assets are available.</p>}
        </article>;
      })}</div>}
      {pageCount > 1 && <nav className="exam-pagination" aria-label="Question bank pages"><span>Page {page} of {pageCount}</span><button className="btn line" disabled={page === 1} onClick={() => changePage(page - 1)}>Previous tests</button><button className="btn line" disabled={page === pageCount} onClick={() => changePage(page + 1)}>Next tests</button></nav>}
    </>}
  </section>;
}
