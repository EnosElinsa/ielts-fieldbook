// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  criterionBands,
  criterionLabel,
  dueLexicon,
  studyStreak,
  todaySession,
  weakestCriterion,
} from '../../domain';
import { useFieldbook } from '../../context/FieldbookContext';
import { dayLabel, displayName, formatDate, planPillClass, sessionSkill, typeName } from '../../lib/format';
import { Empty } from '../../components/ui';

export function TodayPage() {
  const fb = useFieldbook();
  const navigate = useNavigate();
  const speaking = fb.activeSkill === 'speaking';
  const [plans, setPlans] = useState([]);
  useEffect(() => {
    setPlans(fb.ensurePlansForSkill());
  }, [fb.state, fb.activeSkill]);
  const skillSessions = fb.state.sessions.filter((s) => sessionSkill(s) === fb.activeSkill);
  const week = useMemo(() => {
    const now = new Date();
    const day = now.getDay() || 7;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - day + 1);
    return skillSessions.filter((session) => new Date(session.date) >= start && new Date(session.date) <= now);
  }, [skillSessions]);
  const session = todaySession(fb.state, null, fb.activeSkill);
  const report = criterionBands(fb.state, fb.activeSkill, 5);
  const weak = weakestCriterion(fb.state, fb.activeSkill);
  const keys = Object.keys(report.bands);
  const exam = fb.state.settings.examDate
    ? new Date(`${fb.state.settings.examDate}T00:00:00`).toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'not set';
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
  const dayWord = fb.state.settings.days.length === 1 ? 'day' : 'days';
  const statusText = { pending: 'Not started', in_progress: 'In progress', completed: 'Done' };

  const assessmentMatches = (assessment) => {
    if (assessment && assessment.skill === 'speaking') return fb.activeSkill === 'speaking';
    const sess = assessment?.sessionId ? fb.state.sessions.find((item) => item.id === assessment.sessionId) : null;
    if (sess) return sessionSkill(sess) === fb.activeSkill;
    return fb.activeSkill === 'writing';
  };
  const errorMatches = (error) => {
    if (!error?.sourceSessionId) return true;
    const sess = fb.state.sessions.find((item) => item.id === error.sourceSessionId);
    if (!sess) return true;
    return sessionSkill(sess) === fb.activeSkill;
  };

  return (
    <section className="view active">
      <div className="lead-grid">
        <div className="lead">
          <p className="kicker">
            <span>{dayLabel(new Date())}</span>
          </p>
          <h2>Today</h2>
          <p>
            {session.weakest
              ? `Practise ${criterionLabel(session.weakest.key).toLowerCase()} first. Work through the steps below.`
              : speaking
                ? 'Today’s speaking is below.'
                : 'Today’s writing is below.'}
          </p>
          <ol className="session-steps">
            {session.steps.map((step, index) => {
              const label = step.id === 'recall' ? 'Recall' : step.id === 'correction' ? 'Use this' : 'Start this';
              const tone = step.id === 'practice' ? 'primary' : 'line';
              return (
                <li className="session-step" key={step.id}>
                  <span className="session-index">{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.detail}</p>
                  </div>
                  <button
                    type="button"
                    className={`btn ${tone}`}
                    onClick={() => {
                      if (step.id === 'recall') {
                        fb.setLexiconDueOnly(true);
                        navigate('/phrases');
                        return;
                      }
                      if (step.id === 'correction') {
                        fb.setSkill('writing', '/write');
                        return;
                      }
                      const first = plans.find((item) => item.status !== 'completed') || plans[0];
                      if (first) fb.startPlan(first.id);
                      else navigate(speaking ? '/speak' : '/write');
                    }}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="lead-actions">
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                const first = plans.find((item) => item.status !== 'completed') || plans[0];
                if (first) fb.startPlan(first.id);
              }}
            >
              Start
            </button>
            {!speaking ? (
              <button
                className="btn line"
                type="button"
                onClick={() => {
                  fb.setMockExam('task1');
                  fb.setActiveDeskMode('timed');
                  fb.setSkill('writing');
                  const question =
                    fb.selectWritingQuestion(fb.state, '1', fb.state.questions) ||
                    fb.state.questions.find((item) => item.type === '1') ||
                    fb.state.questions[0];
                  fb.chooseQuestion(question.id);
                  fb.toast('Writing mock: Task 1 first, 20 minutes. Start the timer.');
                }}
              >
                Writing mock
              </button>
            ) : null}
          </div>
        </div>
        <div className="quiet">
          <h3>Recent scores</h3>
          <div>
            {!keys.length ? (
              <p className="empty">Import a score and this will show which criterion to practise first.</p>
            ) : (
              <>
                <div className="band-list">
                  {keys.map((key) => (
                    <div key={key} className={`band-row${weak && weak.key === key ? ' is-low' : ''}`}>
                      <span>{criterionLabel(key)}</span>
                      <strong>{report.bands[key]}</strong>
                    </div>
                  ))}
                </div>
                {weak ? (
                  <p className="rule-note">Practise {criterionLabel(weak.key).toLowerCase()} first.</p>
                ) : null}
              </>
            )}
          </div>
          <div className="fact">
            <strong>{week.length}</strong>
            <span>this week</span>
          </div>
          <p>
            {fb.state.settings.days.length} {dayWord} a week · {fb.state.settings.dailyMinutes} min a day · {mix} ·{' '}
            {focus} · Exam {exam}
            {fb.state.settings.targetBand ? ` · Target ${fb.state.settings.targetBand}` : ''}
          </p>
          <div className="rule-note">{studyStreak(fb.state)}-day streak</div>
        </div>
      </div>
      <div className="metrics">
        <div className="metric">
          <label>This week</label>
          <strong>{week.length}</strong>
          <small>sessions</small>
        </div>
        <div className="metric">
          <label>Words</label>
          <strong>{skillSessions.reduce((sum, s) => sum + Number(s.words || 0), 0).toLocaleString()}</strong>
          <small>written so far</small>
        </div>
        <div className="metric">
          <label>Open</label>
          <strong>{fb.state.errors.filter((e) => !e.resolved && errorMatches(e)).length}</strong>
          <small>mistakes</small>
        </div>
        <div className="metric">
          <label>Scores</label>
          <strong>{fb.state.assessments.filter(assessmentMatches).length}</strong>
          <small>imported</small>
        </div>
        <button className="metric metric-link" type="button" onClick={() => navigate('/phrases')}>
          <label>Due phrases</label>
          <strong>{dueLexicon(fb.state, null, fb.activeSkill).length}</strong>
          <small>due today</small>
        </button>
      </div>
      <div className="section-head">
        <div>
          <h3>Coming up</h3>
          <p>
            {fb.state.settings.days.length} {dayWord} a week · {fb.state.settings.dailyMinutes} min a day
          </p>
        </div>
        <Link className="btn line" to="/progress">
          Open progress →
        </Link>
      </div>
      <div className="plan">
        {plans.length ? (
          plans.map((plan, index) => (
            <div key={plan.id} className={`plan-card${index === 0 && plan.status !== 'completed' ? ' next' : ''}`}>
              <div>
                <div className="plan-top">
                  <span className="date">
                    {dayLabel(`${plan.dateKey}T00:00:00`)} · {fb.state.settings.dailyMinutes} min
                  </span>
                  <span className={`pill ${planPillClass(plan.kind)}`}>{plan.title}</span>
                </div>
                <h4>{plan.title.replace(/^.*?· /, '')}</h4>
                <p>{plan.description}</p>
              </div>
              <div className="plan-foot">
                <span className="status">{statusText[plan.status] || plan.status}</span>
                <button
                  className={`btn ${plan.status === 'completed' ? 'line' : 'primary'}`}
                  type="button"
                  onClick={() => fb.startPlan(plan.id)}
                >
                  {plan.status === 'completed' ? 'View' : plan.status === 'in_progress' ? 'Continue' : 'Start'}
                </button>
              </div>
            </div>
          ))
        ) : (
          <Empty message="No plan yet." label="Open settings" onAction={() => fb.openModal('settings')} />
        )}
      </div>
      <div className="section-head">
        <div>
          <h3>Recent work</h3>
          <p>{speaking ? 'Recent attempts and scores.' : 'Recent essays and scores.'}</p>
        </div>
        <Link className="btn line" to="/review">
          Open review →
        </Link>
      </div>
      <div className="panel">
        {skillSessions.length ? (
          skillSessions
            .slice()
            .reverse()
            .slice(0, 5)
            .map((sess) => (
              <div className="work-row" key={sess.id}>
                <div className="work-name">
                  {displayName(sess.name)}
                  <small>
                    {formatDate(sess.date)} · {sess.words} words
                    {sess.next ? ` · Next: ${sess.next}` : ''}
                  </small>
                </div>
                <span className="work-type">{typeName(sess)}</span>
                <span className={`pill${sess.assessmentId ? ' green' : ''}`}>
                  {sess.assessmentId
                    ? 'Marked'
                    : sess.attemptKind === 'rewrite'
                      ? 'Rewrite'
                      : sessionSkill(sess) === 'speaking'
                        ? 'Spoken'
                        : 'First draft'}
                </span>
              </div>
            ))
        ) : (
          <Empty
            message={speaking ? 'No speaking attempts yet.' : 'No essays yet.'}
            label={speaking ? 'Practise' : 'Write one'}
            onAction={() => navigate(speaking ? '/speak' : '/write')}
          />
        )}
      </div>
    </section>
  );
}
