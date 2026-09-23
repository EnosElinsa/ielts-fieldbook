// @ts-nocheck
import { useFieldbook } from '../../context/FieldbookContext';
import { attemptLabel, formatDate, sessionSkill } from '../../lib/format';

export function HistoryModal() {
  const fb = useFieldbook();
  const open = fb.modal === 'history';
  const session = fb.viewedSession;
  if (!open || !session) return null;

  return (
    <div className="modal-bg show" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && fb.closeModal()}>
      <div className="modal">
        <h3>
          {session.name} · {attemptLabel(session)}
        </h3>
        <p>
          {formatDate(session.date, true)} · {session.words} words
        </p>
        <div className="history-copy">{session.essay}</div>
        <div className="modal-foot">
          <button className="btn line" type="button" onClick={() => fb.closeModal()}>
            Close
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              fb.closeModal();
              if (sessionSkill(session) === 'speaking') {
                const topic = fb.state.speakingTopics.find((t) => String(t.id) === String(session.questionId));
                if (topic) {
                  fb.setSelectedTopicId(String(topic.id));
                  fb.setDeskPart(String(session.part || '2'));
                  fb.setSpeakingDraft(topic.id, {
                    transcript: session.essay,
                    notes: session.notes || fb.speakingDraft(topic.id).notes,
                    parentSessionId: session.id,
                  });
                  fb.persistNow();
                  fb.navigate('/speak');
                  fb.toast('Copied into a new draft.');
                }
                return;
              }
              const q = fb.state.questions.find((question) => String(question.id) === String(session.questionId));
              if (q) fb.setSelectedQuestionId(String(q.id));
              fb.setWritingDraft(q?.id || session.questionId, session.essay, { parentSessionId: session.id });
              fb.persistNow();
              fb.navigate('/write');
              fb.toast('Copied into a new draft.');
            }}
          >
            Continue in a new draft
          </button>
        </div>
      </div>
    </div>
  );
}
