// @ts-nocheck
export const chartLabels = {
  折线图: 'Line graph',
  柱状图: 'Bar chart',
  饼状图: 'Pie chart',
  表格: 'Table',
  地图: 'Map',
  流程图: 'Process',
  混合图: 'Mixed charts',
  '文化/生活类': 'Culture and lifestyle',
  社会类: 'Society',
  教育类: 'Education',
  环境类: 'Environment',
  技术类: 'Technology',
  政府类: 'Government',
};

export function displayName(value) {
  return Object.keys(chartLabels)
    .sort((a, b) => b.length - a.length)
    .reduce((text, key) => text.split(key).join(chartLabels[key]), String(value || ''));
}

export function formatLabel(value) {
  return chartLabels[value] || value || 'Question';
}

export function formatDate(value, withTime) {
  return new Date(value).toLocaleString(
    'en-GB',
    withTime
      ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { year: 'numeric', month: 'short', day: 'numeric' },
  );
}

export function dayLabel(value) {
  return new Date(value).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', weekday: 'short' });
}

export function formatClock(total) {
  const value = Math.max(0, Number(total) || 0);
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function safeSource(value) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
}

export function safeImage(value) {
  const text = String(value || '');
  if (/^(question-assets|sample\/assets)\/[A-Za-z0-9._-]+$/.test(text)) return `/${text}`;
  return '';
}

export function sessionSkill(session) {
  return session && session.skill === 'speaking' ? 'speaking' : 'writing';
}

export function typeName(item) {
  if (sessionSkill(item) === 'speaking') return `Part ${item.part || item.type || ''}`.trim();
  return String(item && item.type) === '1' ? 'Task 1' : 'Task 2';
}

export function attemptLabel(session) {
  if (sessionSkill(session) === 'speaking') return session.attemptKind === 'rewrite' ? 'Retake' : 'Spoken';
  return session.attemptKind === 'rewrite' ? 'Rewrite' : 'First draft';
}

export function lexiconItemSkill(item) {
  return item && item.skill === 'speaking' ? 'speaking' : 'writing';
}

export function speakingKinds() {
  return ['speaking-p1', 'speaking-p2', 'speaking-p3', 'stories', 'speaking-mock'];
}

export function planPillClass(kind) {
  if (kind === '1' || kind === 'speaking-p1') return 'blue';
  if (kind === '2' || kind === 'speaking-p2') return 'red';
  return 'green';
}

export const lexiconLabels = { word: 'Word', phrase: 'Phrase', sentence: 'Pattern' };
export const lexiconStatusLabels = { new: 'New', learning: 'Learning', mastered: 'Known' };

export function coverageLabel(status) {
  return { unseen: 'Not seen', prepared: 'Has a story', practiced: 'Practised', assessed: 'Marked' }[status] || status;
}

export function coverageClass(status) {
  return { unseen: '', prepared: 'blue', practiced: 'green', assessed: 'green' }[status] || '';
}

export function markdownLines(text: string): string[] {
  return String(text || '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '• ')
    .split('\n');
}
