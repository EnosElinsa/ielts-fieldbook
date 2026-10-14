// @ts-nocheck
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, CheckCheck, FileCheck2, PenLine } from 'lucide-react';
import { criterionBands, criterionLabel, criterionSeries, numericOveralls } from '../../domain';
import { useFieldbook } from '../../context/FieldbookContext';
import { formatDate, sessionSkill } from '../../lib/format';
import { planMatchesSkill } from '../../lib/planTemplates';
import { Empty, FilterMenu } from '../../components/ui';
import { VocabularyProgressPage } from '../vocabulary/VocabularyPages';
import { ExamProgressPanel } from '../exam/ExamProgressPanel';
import { activityBuckets, activityInRange, progressRangeStart } from './practiceActivity';

export function ProgressPage() {
  const fb = useFieldbook();
  const [params, setParams] = useSearchParams();
  const category = ['writing','speaking','reading','listening','vocabulary'].includes(params.get('category')) ? params.get('category') : fb.activeSkill;
  const skill = category;
  function selectCategory(value) { const next = new URLSearchParams(params); next.set('category',value); next.delete('task'); setParams(next,{replace:true}); }
  const update = (key, value) => setParams(current => { const next = new URLSearchParams(current); next.set(key, value); return next; }, { replace: true });
  const range = ['7','30','90','all'].includes(params.get('range')) ? params.get('range') : '30';
  const task = (skill === 'speaking' ? ['1','2','3'] : ['1','2']).includes(params.get('task')) ? params.get('task') : 'all';
  const [status, setStatus] = useState('all');
  const speaking = skill === 'speaking';
  const receptive = skill === 'reading' || skill === 'listening';
  const now = new Date();
  const since = progressRangeStart(range, now);
  const inRange = (date) => activityInRange(date, since, now);
  const sourceSessions = fb.state.sessions.filter((session) => sessionSkill(session) === skill &&
    (task === 'all' || String(speaking ? session.part || session.type : session.type) === task));
  const sessions = sourceSessions.filter(session => inRange(session.date));
  const sessionIds = new Set(sourceSessions.map((session) => session.id));
  const assessments = fb.state.assessments.filter((assessment) => {
    const source = fb.state.sessions.find((session) => session.id === assessment.sessionId);
    const assessmentTask = String(speaking ? assessment.part || '' : String(assessment.task || '').replace('Task ', ''));
    return inRange(assessment.date) && (source ? sessionIds.has(source.id) : (assessment.skill || 'writing') === skill && (task === 'all' || assessmentTask === task));
  });
  const filteredState = { ...fb.state, sessions: sourceSessions, assessments };
  const scores = numericOveralls(filteredState, skill, 100);
  const series = criterionSeries(filteredState, skill, 100);
  const bands = criterionBands(filteredState, skill, 100);
  const rewrites = sessions.filter((session) => session.parentSessionId);
  const completedLoops = new Set(rewrites.filter((session) => fb.state.sessions.find((original) => original.id === session.parentSessionId)?.assessmentId).map((session) => session.parentSessionId)).size;
  const target = Number(fb.state.settings.targetBand);
  const hasTarget = Number.isFinite(target) && target >= 1 && target <= 9;
  const keys = speaking ? ['FC', 'LR', 'GRA'] : ['TA', 'TR', 'CC', 'LR', 'GRA'];
  const colors = { TA: '#2563eb', TR: '#2563eb', CC: '#0d9488', FC: '#0d9488', LR: '#c08417', GRA: '#dc526d' };
  const chartData = scores.map((item, index) => {
    const assessment = assessments.find((entry) => entry.id === item.id);
    const source = sourceSessions.find((entry) => entry.id === assessment?.sessionId);
    const candidateGroup = String(speaking ? source?.part || assessment?.part || '' : source?.type || assessment?.task?.replace('Task ', '') || '');
    const group = (speaking ? ['1', '2', '3'] : ['1', '2']).includes(candidateGroup) ? candidateGroup : 'unknown';
    return { ...item, attempt: index + 1, overall: Number(item.overall), label: formatDate(item.date, true), group,
      [`group${group}`]: Number(item.overall), ...(series.find((entry) => entry.id === item.id)?.scores || {}) };
  });
  const scoreGroups = [...new Set(chartData.map((item) => item.group))].filter(Boolean);
  const scoreGroupLabel = group => group === 'unknown' ? `Unspecified ${speaking ? 'part' : 'task'}` : `${speaking ? 'Part' : 'Task'} ${group}`;
  const activity = activityBuckets(sessions.map(session => session.date), since, now);
  const weeks = activity.buckets;
  const max = Math.max(1, ...weeks.map((week) => week.count));
  const plans = fb.state.plans.filter((plan) => planMatchesSkill(plan, skill) && inRange(plan.dateKey) && (status === 'all' || status === plan.status)).slice().sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const statusNames = { pending: 'Not started', in_progress: 'In progress', completed: 'Completed' };
  return (
    <section className="view active progress-view">
      <div className="page-tools"><p>Practice results and imported feedback.</p><Link to={skill === 'vocabulary' ? '/vocabulary/review' : receptive ? `/${skill}` : `/review?skill=${skill}`} className="btn line">{skill === 'vocabulary' ? 'Review vocabulary' : receptive ? 'Open practice bank' : 'Review attempts'} <ArrowUpRight size={16} /></Link></div>
      <div className="toolbar">
        <FilterMenu label="Progress skill" value={skill} onChange={selectCategory} options={[{ value: 'listening', label: 'Listening' }, { value: 'reading', label: 'Reading' }, { value: 'writing', label: 'Writing' }, { value: 'speaking', label: 'Speaking' }, { value: 'vocabulary', label: 'Vocabulary' }]} />
        <FilterMenu label="Time range" value={range} onChange={value => update('range', value)} options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: 'all', label: 'All time' }]} />
        {!receptive && skill !== 'vocabulary' && <FilterMenu label="Task or part" value={task} onChange={value => update('task', value)} options={speaking ? [{ value: 'all', label: 'All parts' }, { value: '1', label: 'Part 1' }, { value: '2', label: 'Part 2' }, { value: '3', label: 'Part 3' }] : [{ value: 'all', label: 'All tasks' }, { value: '1', label: 'Task 1' }, { value: '2', label: 'Task 2' }]} />}
      </div>
      {skill === 'vocabulary' ? <VocabularyProgressPage embedded since={since} /> : receptive ? <ExamProgressPanel skill={skill} since={since} /> : <>
      <div className="progress-metrics">
        {[{ label: 'Practice attempts', value: sessions.length, icon: PenLine }, { label: 'Feedback received', value: assessments.length, icon: FileCheck2 }, { label: 'Rewrites & retakes', value: rewrites.length, icon: CheckCheck }, { label: 'Feedback followed by practice', value: completedLoops, icon: ArrowUpRight }].map(({ label, value, icon: Icon }) => <div className="progress-metric" key={label}><Icon size={18} /><strong>{value}</strong><span>{label}</span></div>)}
      </div>
      <div className="progress-score-section">
        <div className="section-head"><div><h3>Band trend</h3><p>{scores.length} comparable {scores.length === 1 ? 'sample' : 'samples'}{hasTarget ? ` · Target ${target}` : ''}</p></div></div>
        {chartData.length ? <>
          <div className="progress-chart" role="img" aria-label={`Band score trend: ${scores.map((score) => score.overall).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 18, right: 18, bottom: 8, left: -18 }}><CartesianGrid stroke="var(--rule)" vertical={false} /><XAxis dataKey="attempt" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} /><YAxis domain={[0, 9]} ticks={[0, 3, 5, 7, 9]} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} /><Tooltip contentStyle={{ background: 'var(--sheet)', border: '1px solid var(--rule)', borderRadius: 6, color: 'var(--ink)' }} labelFormatter={(value) => chartData.find((entry) => entry.attempt === value)?.label || value} />{hasTarget ? <ReferenceLine y={target} stroke="var(--muted)" strokeDasharray="4 4" /> : null}{task === 'all' ? scoreGroups.map((group, index) => <Line key={group} type="linear" dataKey={`group${group}`} name={`${scoreGroupLabel(group)} overall`} stroke={['#2563eb', '#0d9488', '#dc526d'][index % 3]} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />) : <Line type="linear" dataKey="overall" name="Overall" stroke="var(--blue)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false} />}{task !== 'all' ? keys.map((key) => <Line key={key} type="linear" dataKey={key} name={criterionLabel(key)} stroke={colors[key]} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />) : null}</LineChart></ResponsiveContainer>
          </div>
          <div className="progress-legend">{task === 'all' ? scoreGroups.map((group, index) => <span key={group}><i style={{ background: ['#2563eb', '#0d9488', '#dc526d'][index % 3] }} />{scoreGroupLabel(group)} · {chartData.filter((item) => item.group === group).length} samples</span>) : <><span><i style={{ background: 'var(--blue)' }} />Overall</span>{keys.filter((key) => bands.bands[key] != null).map((key) => <span key={key}><i style={{ background: colors[key] }} />{criterionLabel(key)} <strong>{bands.bands[key]}</strong></span>)}</>}</div>
          <div className="progress-score-table"><table><caption className="sr-only">Comparable scores by attempt</caption><thead><tr><th>Date</th><th>Overall</th><th>Feedback</th></tr></thead><tbody>{scores.slice().reverse().map((score) => <tr key={score.id}><td>{formatDate(score.date, true)}</td><td>{score.overall}{score.estimated ? ' · estimated' : ''}</td><td><Link to={`/review/${score.id}`}>View feedback</Link></td></tr>)}</tbody></table></div>
        </> : <Empty message="No comparable scores in this range." label="Import feedback" onAction={() => fb.openFeedbackImport()} />}
        <p className="rule-note">Short exercises and historical attempts with an unknown training mode are excluded from band trends.{speaking ? ' Transcription-only feedback does not include pronunciation.' : ''}</p>
      </div>
      <div className="evidence-grid">
        <section className="progress-section"><h3>{activity.period} practice</h3><div className="week-bars">{weeks.map((week) => <div className="week-bar" key={week.start}><span>{week.label}</span><div className="track"><div className="fill" style={{ width: `${week.count / max * 100}%` }} /></div><strong>{week.count}</strong></div>)}</div></section>
        <section className="progress-section"><div className="section-head"><h3>Study plans</h3><FilterMenu label="Plan status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Any status' }, { value: 'pending', label: 'Not started' }, { value: 'in_progress', label: 'In progress' }, { value: 'completed', label: 'Completed' }]} /></div>{plans.length ? <div className="plan-list">{plans.map((plan) => <div className="work-row" key={plan.id}><div className="work-name">{plan.title}<small>{plan.dateKey}</small></div><span className={`pill ${plan.status === 'completed' ? 'green' : ''}`}>{statusNames[plan.status]}</span></div>)}</div> : <Empty message="No plans in this range." />}</section>
      </div>
      </>}
    </section>
  );
}
