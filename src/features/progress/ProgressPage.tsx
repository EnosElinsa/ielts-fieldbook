// @ts-nocheck
import { useMemo, useState } from 'react';
import {
  criterionBands,
  criterionLabel,
  criterionSeries,
  numericOveralls,
  speakingCoverageCounts,
  weakestCriterion,
} from '../../domain';
import { useFieldbook } from '../../context/FieldbookContext';
import { formatDate, sessionSkill } from '../../lib/format';
import { planMatchesSkill as matchPlan } from '../../lib/planTemplates';
import { Empty, FilterMenu } from '../../components/ui';

export function ProgressPage() {
  const fb = useFieldbook();
  const [filter, setFilter] = useState('all');
  const speaking = fb.activeSkill === 'speaking';
  const skillSessions = fb.state.sessions.filter((s) => sessionSkill(s) === fb.activeSkill);

  const bars = useMemo(() => {
    const now = new Date();
    const list = [];
    for (let index = 3; index >= 0; index -= 1) {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      end.setDate(end.getDate() - index * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      list.push({
        label: `${start.getMonth() + 1}/${start.getDate()}`,
        count: skillSessions.filter((session) => new Date(session.date) >= start && new Date(session.date) <= end)
          .length,
      });
    }
    return list;
  }, [skillSessions]);

  const max = Math.max(1, ...bars.map((bar) => bar.count));
  const scores = numericOveralls(fb.state, fb.activeSkill, 8);
  const series = criterionSeries(fb.state, fb.activeSkill, 8);
  const bands = criterionBands(fb.state, fb.activeSkill, 5);
  const weak = weakestCriterion(fb.state, fb.activeSkill);
  const keys = Object.keys(bands.bands);
  const targetBand = Number(fb.state.settings.targetBand);
  const hasTarget = Number.isFinite(targetBand) && targetBand >= 1 && targetBand <= 9;
  const seriesKeys = speaking ? ['FC', 'LR', 'GRA'] : ['TA', 'TR', 'CC', 'LR', 'GRA'];
  const focus = speaking
    ? fb.state.settings.speakingFocus === 'part1'
      ? 'Part 1 first'
      : fb.state.settings.speakingFocus === 'part2'
        ? 'Part 2 first'
        : 'Part 1 and Part 2'
    : fb.state.settings.focus === 'task1'
      ? 'Task 1 first'
      : fb.state.settings.focus === 'task2'
        ? 'Task 2 first'
        : 'Task 1 and Task 2';
  const mix =
    fb.state.settings.skillMix === 'speaking'
      ? 'Speaking only'
      : fb.state.settings.skillMix === 'writing'
        ? 'Writing only'
        : 'Writing and speaking';
  const plans = fb.state.plans
    .slice()
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
    .filter((plan) => (filter === 'all' || plan.status === filter) && matchPlan(plan, fb.activeSkill));
  const names = { pending: 'Not started', in_progress: 'In progress', completed: 'Done' };
  const assessmentMatches = (assessment) => {
    if (assessment && assessment.skill === 'speaking') return speaking;
    const sess = assessment?.sessionId ? fb.state.sessions.find((item) => item.id === assessment.sessionId) : null;
    if (sess) return sessionSkill(sess) === fb.activeSkill;
    return !speaking;
  };

  return (
    <section className="view active">
      <div className="page-tools">
        <p>Score trend, and your current settings.</p>
      </div>
      <div className="evidence-grid">
        <div className="panel">
          <h3>Recent scores</h3>
          <div className="week-bars">
            {scores.length ? (
              scores.map((item, index) => (
                <div className="week-bar" key={index}>
                  <span>{item.estimated ? 'No audio' : 'Overall'}</span>
                  <div className="track">
                    {hasTarget ? (
                      <span className="target-line" style={{ left: `${(targetBand / 9) * 100}%` }} title={`Target ${targetBand}`} />
                    ) : null}
                    <div className="fill" style={{ width: `${(Number(item.overall) / 9) * 100}%` }} />
                  </div>
                  <strong>{item.overall}</strong>
                </div>
              ))
            ) : (
              <div className="empty">No band scores yet.</div>
            )}
          </div>
          {series.length ? (
            <div className="mt-16">
              <h4 className="series-title">Criteria by attempt</h4>
              {hasTarget ? <p className="rule-note">Target band {targetBand}</p> : null}
              <div className="criteria-series">
                {series.map((item) => (
                  <div className="series-attempt" key={item.id}>
                    <div className="series-date">{formatDate(item.date, true)}</div>
                    {seriesKeys.map((key) => {
                      const score = item.scores[key];
                      if (score == null) return null;
                      return (
                        <div className="week-bar" key={key}>
                          <span>{criterionLabel(key)}</span>
                          <div className="track">
                            {hasTarget ? (
                              <span className="target-line" style={{ left: `${(targetBand / 9) * 100}%` }} />
                            ) : null}
                            <div className="fill" style={{ width: `${(Number(score) / 9) * 100}%` }} />
                          </div>
                          <strong>{score}</strong>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-16">
            {!keys.length ? (
              <div className="empty">
                <p>Import a score and this will show which criterion to practise first.</p>
              </div>
            ) : (
              <div className="band-list">
                {keys.map((key) => (
                  <div key={key} className={`band-row${weak && weak.key === key ? ' is-low' : ''}`}>
                    <span>
                      {criterionLabel(key)}
                      {weak && weak.key === key ? ' · first' : ''}
                    </span>
                    <strong>{bands.bands[key]}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
          {speaking ? (
            <div className="evidence-note">
              {(() => {
                const counts = speakingCoverageCounts(fb.state, fb.state.speakingTopics);
                return (
                  <p>
                    Not seen {counts.unseen} · Has a story {counts.prepared} · Practised {counts.practiced} · Marked{' '}
                    {counts.assessed}
                  </p>
                );
              })()}
            </div>
          ) : null}
        </div>
        <div className="panel">
          <h3>How much you practised</h3>
          <div className="week-bars">
            {bars.map((bar) => (
              <div className="week-bar" key={bar.label}>
                <span>{bar.label}</span>
                <div className="track">
                  <div className="fill" style={{ width: `${(bar.count / max) * 100}%` }} />
                </div>
                <strong>{bar.count}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="evidence-grid mt-14">
        <div className="panel">
          <h3>Settings</h3>
          <div className="evidence-note">
            <p>
              Skill: <strong>{speaking ? 'Speaking' : 'Writing'}</strong>
            </p>
            <p>
              Mix: <strong>{mix}</strong>
            </p>
            <p>
              Study days: <strong>{fb.state.settings.days.length} a week</strong>
            </p>
            <p>
              Daily time: <strong>{fb.state.settings.dailyMinutes} min</strong>
            </p>
            <p>
              Focus: <strong>{focus}</strong>
            </p>
            <p>
              Target band: <strong>{fb.state.settings.targetBand || 'Not set'}</strong>
            </p>
            <p>
              Exam date: <strong>{fb.state.settings.examDate || 'Not set'}</strong>
            </p>
            <p>
              Attempts: <strong>{skillSessions.length}</strong>
            </p>
            <p>
              Scores: <strong>{fb.state.assessments.filter(assessmentMatches).length}</strong>
            </p>
            <p>
              Phrases: <strong>{fb.state.lexicon.length}</strong>
            </p>
            <p>
              Stories: <strong>{(fb.state.stories || []).length}</strong>
            </p>
          </div>
        </div>
        <div className="panel">
          <h3>Plans</h3>
          <p>What you have done shows up here.</p>
          <FilterMenu
            label="Plan status"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Any status' },
              { value: 'pending', label: 'Not started' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'completed', label: 'Done' },
            ]}
          />
          <div className="plan-list">
            {plans.length ? (
              plans.map((plan) => (
                <div className="work-row" key={plan.id}>
                  <div className="work-name">
                    {plan.title}
                    <small>
                      {plan.dateKey}
                      {plan.completedAt ? ` · done ${formatDate(plan.completedAt, true)}` : ''}
                    </small>
                  </div>
                  <span
                    className={`pill ${plan.status === 'completed' ? 'green' : plan.status === 'in_progress' ? 'blue' : ''}`}
                  >
                    {names[plan.status]}
                  </span>
                </div>
              ))
            ) : (
              <Empty message="No plans in this filter." />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
