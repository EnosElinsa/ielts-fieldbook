import { useEffect, useState } from 'react';
import { accountGeneration, accountId } from '../../storage/accountIdentity';
import { loadProgressPlans, type ProgressPlan } from '../../storage/progressPlans';
import type { StudyPlan, StudySkill } from '../../domain/plans';
import { dateKey } from '../../domain/utils';
import { formatDateKey } from '../../lib/format';
import { Empty, FilterMenu } from '../../components/ui';
import { PanelLoadingState } from '../../components/AsyncState';

const statusNames = { pending: 'Not started', in_progress: 'In progress', completed: 'Completed', skipped: 'Skipped' };
const PAGE_SIZE = 20;
export function ProgressPlansPanel({ skill, since, revision }: { skill: StudySkill; since: number; revision?: string }) {
  const from = since ? dateKey(new Date(since)) : '', to = dateKey(new Date());
  return <PlanStatusFilter key={`${accountId()}:${accountGeneration()}:${skill}`} skill={skill} from={from} to={to} revision={revision} />;
}

type PlanScope = { skill: StudySkill; from: string; to: string; revision?: string };

function PlanStatusFilter({ skill, from, to, revision }: PlanScope) {
  const [status, setStatus] = useState<StudyPlan['status'] | 'all'>('all');
  return <section className="progress-section" aria-labelledby="progress-plans-heading">
    <div className="section-head"><h2 id="progress-plans-heading">Study plans</h2><FilterMenu label="Plan status" value={status} onChange={value => setStatus(value as typeof status)} options={[{ value: 'all', label: 'Any status' }, ...Object.entries(statusNames).map(([value, label]) => ({ value, label }))]} /></div>
    <PlanResults key={`${from}:${to}:${status}`} skill={skill} from={from} to={to} status={status} revision={revision} />
  </section>;
}

function PlanResults({ skill, from, to, revision, status }: PlanScope & { status: StudyPlan['status'] | 'all' }) {
  const [page, setPage] = useState(0), [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; plans: ProgressPlan[]; total: number } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const key = `${page}:${status}:${retry}:${revision}`;
  useEffect(() => {
    let active = true;
    setError(null);
    loadProgressPlans({ skill, from, to, status, offset: page * PAGE_SIZE, limit: PAGE_SIZE }).then(value => {
      if (!active) return;
      const lastPage = Math.max(0, Math.ceil(value.total / PAGE_SIZE) - 1);
      if (page > lastPage) { setPage(lastPage); return; }
      setError(null); setResult({ key, ...value });
    }).catch(cause => {
      if (active) setError({ key, message: cause instanceof Error ? cause.message : 'Study plans could not load. Retry shortly.' });
    });
    return () => { active = false; };
  }, [skill, from, to, page, status, key]);
  const failure = error?.key === key ? error.message : '';
  const loaded = result?.key === key;
  const canGoBack = loaded && !failure && page > 0;
  const canGoForward = loaded && !failure && (page + 1) * PAGE_SIZE < result.total;
  return <>
    {failure ? <div role="alert"><p>{failure}</p><button type="button" className="btn line" onClick={() => { setPage(0); setRetry(value => value + 1); }}>Retry plans</button>{page > 0 && <button type="button" className="btn line" onClick={() => setPage(0)}>First page</button>}</div>
      : !loaded ? <PanelLoadingState variant="list" message="Loading study plans…" />
      : result.plans.length ? <div className="plan-list">{result.plans.map(plan => <div className="work-row" key={plan.id}><div className="work-name">{plan.title}<small>{formatDateKey(plan.dateKey)}</small></div><span className={`pill ${plan.status === 'completed' ? 'green' : ''}`}>{statusNames[plan.status]}</span></div>)}</div>
      : <Empty message="No plans in this range." />}
    {result && result.total > PAGE_SIZE && <nav className="study-pagination" aria-label="Study plan pages">
      <button type="button" className="btn line" aria-disabled={!canGoBack} onClick={() => { if (canGoBack) setPage(value => value - 1); }}>Previous page</button>
      <span role="status">{failure ? 'Page unavailable' : loaded ? `Page ${page + 1} of ${Math.ceil(result.total / PAGE_SIZE)} · ${result.total} plans` : 'Loading page…'}</span>
      <button type="button" className="btn line" aria-disabled={!canGoForward} onClick={() => { if (canGoForward) setPage(value => value + 1); }}>Next page</button>
    </nav>}
  </>;
}
