// @ts-nocheck
import { useMemo, useState } from 'react';
import { useFieldbook } from '../../context/FieldbookContext';
import { displayName, formatLabel, safeImage, safeSource, typeName } from '../../lib/format';
import { Empty } from '../../components/ui';

export function WritingBankPage() {
  const fb = useFieldbook();
  const [search, setSearch] = useState('');
  const [task, setTask] = useState('all');
  const [format, setFormat] = useState('all');
  const questions = useMemo(() => {
    const q = search.toLowerCase();
    return fb.state.questions.filter(
      (question) =>
        (task === 'all' || question.type === task) &&
        (format === 'all' || question.format === format) &&
        (!q || `${question.name} ${question.prompt}`.toLowerCase().includes(q)),
    );
  }, [fb.state.questions, search, task, format]);

  return (
    <section className="view active">
      <div className="section-head">
        <div>
          <p className="kicker">Question bank</p>
          <h3>Writing questions</h3>
          <p>{questions.length === 1 ? '1 question' : `${questions.length} questions`}</p>
        </div>
      </div>
      <div className="toolbar">
        <input
          className="search"
          aria-label="Search writing questions"
          placeholder="Search a number, topic, or the question…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select aria-label="Task" value={task} onChange={(e) => setTask(e.target.value)}>
          <option value="all">All tasks</option>
          <option value="1">Task 1</option>
          <option value="2">Task 2</option>
        </select>
        <select aria-label="Chart type" value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="all">All types</option>
          <option value="折线图">Line graph</option>
          <option value="柱状图">Bar chart</option>
          <option value="表格">Table</option>
          <option value="地图">Map</option>
          <option value="流程图">Process</option>
          <option value="混合图">Mixed charts</option>
        </select>
      </div>
      <div className="questions">
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
                </div>
                <h4>{displayName(question.name)}</h4>
                {image ? <img src={image} alt={`${displayName(question.name)} chart`} loading="lazy" /> : null}
                <p>{prompt}</p>
                <div className="q-bottom">
                  <button className="btn primary" type="button" onClick={() => fb.chooseQuestion(question.id)}>
                    Write this
                  </button>
                  <a className="source" href={safeSource(question.source)} target="_blank" rel="noopener noreferrer">
                    Source ↗
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
              setSearch('');
              setTask('all');
              setFormat('all');
            }}
          />
        ) : (
          <Empty message="The question bank did not load. Check that questions.json is in this folder, then refresh." />
        )}
      </div>
    </section>
  );
}
