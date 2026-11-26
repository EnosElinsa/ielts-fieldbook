import { ProgressPlansPanel } from './ProgressPlansPanel';
import { Link, useSearchParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, CheckCheck, FileCheck2, PenLine, Repeat2 } from 'lucide-react';
import { criterionBands, criterionLabel, criterionSeries, numericOveralls } from '../../domain';
import type { StudySkill } from '../../domain/plans';
import { useFieldbook } from '../../context/FieldbookContext';
import { formatDate, plural, sessionSkill } from '../../lib/format';

import { Empty, FilterMenu } from '../../components/ui';
import { VocabularyProgressPage } from '../vocabulary/VocabularyPages';
import { ExamProgressPanel } from '../exam/ExamProgressPanel';
import { activityBuckets, activityInRange, progressRangeStart } from './practiceActivity';

const BAND_TICKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
// Point labels are "3 Oct, 17:00"; the axis shows only the day.
const shortChartDate = (value: unknown) => String(value || '').split(',')[0];

type ProgressSession = {
  id: string;
  date: string;
  skill?: string;
  type?: string | number;
  part?: string | number;
  parentSessionId?: string | null;
  assessmentId?: string | null;
};

type ProgressAssessment = {
  id: string;
  sessionId?: string | null;
  date: string;
  skill?: string;
  part?: string | number;
  task?: string | number;
};

type ProgressScore = {
  id: string;
  date: string;
  overall: number | string;
  estimated?: boolean;
};

type SeriesPoint = {
  id: string;
  scores?: Record<string, number>;
};

const VALID_CATEGORIES: readonly StudySkill[] = ['writing', 'speaking', 'reading', 'listening', 'vocabulary'];
const VALID_RANGES = ['7', '30', '90', 'all'] as const;

export function ProgressPage() {
  const fb = useFieldbook();
  const [params, setParams] = useSearchParams();
  const requestedCategory = params.get('category');
  const skill: StudySkill = VALID_CATEGORIES.includes(requestedCategory as StudySkill)
    ? (requestedCategory as StudySkill)
    : (VALID_CATEGORIES.includes(fb.activeSkill as StudySkill) ? (fb.activeSkill as StudySkill) : 'writing');
  function selectCategory(value: string) {
    const next = new URLSearchParams(params);
    next.set('category', value);
    next.delete('task');
    setParams(next, { replace: true });
  }
  const update = (key: string, value: string) => setParams(current => { const next = new URLSearchParams(current); next.set(key, value); return next; }, { replace: true });
  const requestedRange = params.get('range');
  const range: (typeof VALID_RANGES)[number] = VALID_RANGES.includes(requestedRange as (typeof VALID_RANGES)[number])
    ? (requestedRange as (typeof VALID_RANGES)[number])
    : '30';
  const requestedTask = params.get('task');
  const task = (skill === 'speaking' ? ['1', '2', '3'] : ['1', '2']).includes(requestedTask || '') ? (requestedTask as string) : 'all';

  const speaking = skill === 'speaking';
  const receptive = skill === 'reading' || skill === 'listening';
  const now = new Date();
  const since = progressRangeStart(range, now);
  const inRange = (date: string) => activityInRange(date, since, now);
  const allSessions = (fb.state.sessions || []) as ProgressSession[];
  const allAssessments = (fb.state.assessments || []) as ProgressAssessment[];
  const allSessionsById = new Map(allSessions.map(session => [session.id, session]));
  const sourceSessions = allSessions.filter((session) => sessionSkill(session) === skill &&
    (task === 'all' || String(speaking ? session.part || session.type : session.type) === task));
  const sessions = sourceSessions.filter(session => inRange(session.date));
  const sourceSessionsById = new Map(sourceSessions.map(session => [session.id, session]));
  const assessments = allAssessments.filter((assessment) => {
    const source = assessment.sessionId ? allSessionsById.get(assessment.sessionId) : undefined;
    const assessmentTask = String(speaking ? assessment.part || '' : String(assessment.task || '').replace('Task ', ''));
    return inRange(assessment.date) && (source ? sourceSessionsById.has(source.id) : (assessment.skill || 'writing') === skill && (task === 'all' || assessmentTask === task));
  });
  const assessmentsById = new Map(assessments.map(entry => [entry.id, entry]));
  const filteredState = { ...fb.state, sessions: sourceSessions, assessments };
  const scores = numericOveralls(filteredState, skill, 100) as ProgressScore[];
  const series = criterionSeries(filteredState, skill, 100) as SeriesPoint[];
  const seriesById = new Map(series.map(entry => [entry.id, entry]));
  const bands = criterionBands(filteredState, skill, 100) as { bands: Record<string, number | null | undefined> };
  const rewrites = sessions.filter((session) => session.parentSessionId);
  const completedLoops = new Set(rewrites.filter((session) => session.parentSessionId && allSessionsById.get(session.parentSessionId)?.assessmentId).map((session) => session.parentSessionId)).size;
  const target = Number(fb.state.settings.targetBand);
  const hasTarget = Number.isFinite(target) && target >= 1 && target <= 9;
  const keys = speaking ? ['FC', 'LR', 'GRA'] : ['TA', 'TR', 'CC', 'LR', 'GRA'];
  const colors: Record<string, string> = { TA: 'var(--blue)', TR: 'var(--blue)', CC: 'var(--teal)', FC: 'var(--teal)', LR: 'var(--gold)', GRA: 'var(--red)' };
  const groupColors = ['var(--blue)', 'var(--teal)', 'var(--red)'];
  const chartData = scores.map((item, index) => {
    const assessment = assessmentsById.get(item.id);
    const source = assessment?.sessionId ? sourceSessionsById.get(assessment.sessionId) : undefined;
    const candidateGroup = String(speaking ? source?.part || assessment?.part || '' : source?.type || String(assessment?.task || '').replace('Task ', '') || '');
    const group = (speaking ? ['1', '2', '3'] : ['1', '2']).includes(candidateGroup) ? candidateGroup : 'unknown';
    return { ...item, attempt: index + 1, overall: Number(item.overall), label: formatDate(item.date, true), group,
      [`group${group}`]: Number(item.overall), ...(seriesById.get(item.id)?.scores || {}) };
  });
  const scoreGroups = [...new Set(chartData.map((item) => item.group))].filter(Boolean);
  const scoreGroupLabel = (group: string) => group === 'unknown' ? `Unspecified ${speaking ? 'part' : 'task'}` : `${speaking ? 'Part' : 'Task'} ${group}`;
  const activity = activityBuckets(sessions.map(session => session.date), since, now);
  const weeks = activity.buckets;
  const max = Math.max(1, ...weeks.map((week) => week.count));


  return (
    <section className="view active progress-view">
      <div className="page-tools"><p>Practice results and imported feedback.</p><Link to={skill === 'vocabulary' ? '/vocabulary/review' : receptive ? `/${skill}` : `/review?skill=${skill}`} className="btn line">{skill === 'vocabulary' ? 'Review vocabulary' : receptive ? 'Open practice bank' : 'Review attempts'} <ArrowRight size={16} /></Link></div>
      <div className="toolbar">
        <FilterMenu label="Progress skill" value={skill} onChange={selectCategory} options={[{ value: 'listening', label: 'Listening' }, { value: 'reading', label: 'Reading' }, { value: 'writing', label: 'Writing' }, { value: 'speaking', label: 'Speaking' }, { value: 'vocabulary', label: 'Vocabulary' }]} />
        <FilterMenu label="Time range" value={range} onChange={value => update('range', value)} options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: 'all', label: 'All time' }]} />
        {!receptive && skill !== 'vocabulary' && <FilterMenu label="Task or part" value={task} onChange={value => update('task', value)} options={speaking ? [{ value: 'all', label: 'All parts' }, { value: '1', label: 'Part 1' }, { value: '2', label: 'Part 2' }, { value: '3', label: 'Part 3' }] : [{ value: 'all', label: 'All tasks' }, { value: '1', label: 'Task 1' }, { value: '2', label: 'Task 2' }]} />}
      </div>
      {skill === 'vocabulary' ? <VocabularyProgressPage embedded since={since} /> : receptive ? <ExamProgressPanel skill={skill} since={since} /> : <>
      <div className="progress-metrics">
        {[{ label: 'Practice attempts', value: sessions.length, icon: PenLine }, { label: 'Feedback received', value: assessments.length, icon: FileCheck2 }, { label: 'Rewrites & retakes', value: rewrites.length, icon: CheckCheck }, { label: 'Feedback followed by practice', value: completedLoops, icon: Repeat2 }].map(({ label, value, icon: Icon }) => <div className="progress-metric" key={label}><Icon size={18} /><strong>{value}</strong><span>{label}</span></div>)}
      </div>
      <div className="progress-score-section">
        <div className="section-head"><div><h2>Band trend</h2><p>{plural(scores.length, 'comparable sample')}{hasTarget ? ` · Target ${target}` : ''}</p></div></div>
        {chartData.length ? <>
          <div className="progress-chart" role="img" aria-label={`Band score trend: ${scores.map((score) => score.overall).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 18, right: 18, bottom: 8, left: -18 }}><CartesianGrid stroke="var(--rule)" vertical={false} /><XAxis dataKey="label" tickFormatter={shortChartDate} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} /><YAxis domain={[0, 9]} ticks={BAND_TICKS} interval={0} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} /><Tooltip contentStyle={{ background: 'var(--sheet)', border: '1px solid var(--rule)', borderRadius: 6, color: 'var(--ink)' }} labelFormatter={(value, payload) => { const entry = payload?.[0]?.payload as { attempt?: number; label?: string } | undefined; return entry ? `Attempt ${entry.attempt} · ${entry.label}` : String(value ?? ''); }} />{hasTarget ? <ReferenceLine y={target} stroke="var(--muted)" strokeDasharray="4 4" /> : null}{task === 'all' ? scoreGroups.map((group, index) => <Line key={group} type="linear" dataKey={`group${group}`} name={`${scoreGroupLabel(group)} overall`} stroke={groupColors[index % 3]} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />) : <Line type="linear" dataKey="overall" name="Overall" stroke="var(--blue)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false} />}{task !== 'all' ? keys.map((key) => <Line key={key} type="linear" dataKey={key} name={criterionLabel(key)} stroke={colors[key]} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />) : null}</LineChart></ResponsiveContainer>
          </div>
          <div className="progress-legend">{task === 'all' ? scoreGroups.map((group, index) => <span key={group}><i style={{ background: groupColors[index % 3] }} />{scoreGroupLabel(group)} · {plural(chartData.filter((item) => item.group === group).length, 'sample')}</span>) : <><span><i style={{ background: 'var(--blue)' }} />Overall</span>{keys.filter((key) => bands.bands[key] != null).map((key) => <span key={key}><i style={{ background: colors[key] }} />{criterionLabel(key)} <strong>{bands.bands[key]}</strong></span>)}</>}</div>
          <div className="progress-score-table" tabIndex={0} role="region" aria-label="Comparable scores by attempt"><table><caption className="sr-only">Comparable scores by attempt</caption><thead><tr><th scope="col">Date</th><th scope="col">Overall</th><th scope="col">Feedback</th></tr></thead><tbody>{scores.slice().reverse().map((score) => <tr key={score.id}><td id={`score-date-${score.id}`}>{formatDate(score.date, true)}</td><td>{score.overall}{score.estimated ? ' · estimated' : ''}</td><td><Link to={`/review/${score.id}`} aria-describedby={`score-date-${score.id}`}>View feedback</Link></td></tr>)}</tbody></table></div>
        </> : <Empty message="No comparable scores in this range." label="Import feedback" onAction={() => fb.openFeedbackImport()} />}
        <p className="rule-note">Short exercises and historical attempts with an unknown training mode are excluded from band trends.{speaking ? ' Transcription-only feedback does not include pronunciation.' : ''}</p>
      </div>
      <div className="evidence-grid">
        <section className="progress-section"><h2>{activity.period} practice</h2><div className="week-bars">{weeks.map((week) => <div className="week-bar" key={week.start}><span>{week.label}</span><div className="track"><div className="fill" style={{ width: `${week.count / max * 100}%` }} /></div><strong>{week.count}</strong></div>)}</div></section>
        <ProgressPlansPanel skill={skill} since={since} revision={fb.saveStatus} />
      </div>
      </>}
    </section>
  );
}
