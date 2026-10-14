import { accountId } from '../../storage/remote';

export async function exportAttemptRequest(fb: any, session: any, copy = false) {
  const owner = accountId();
  const speaking = session.skill === 'speaking';
  try {
    await fb.ensureQuestionBank?.(speaking ? 'speaking' : 'writing');
    if (owner !== accountId()) return;
    const state = fb.stateRef?.current || fb.state;
    const question = (speaking ? state.speakingTopics : state.questions).find((item: any) => String(item.id) === String(session.questionId));
    if (!question) { fb.toast('The source question is unavailable.'); return; }
    const request = speaking ? fb.buildSpeakingAssessmentRequest(session, question) : fb.buildAssessmentRequest(session, question);
    if (!copy) { fb.downloadFile(`ielts-assessment-request-${session.id}.md`, request, 'text/markdown'); return; }
    try { await navigator.clipboard.writeText(request); fb.toast('Assessment request copied.'); }
    catch { fb.toast('Clipboard unavailable. Download the request instead.'); }
  } catch { fb.toast('Could not load the source question. Try again.'); }
}
