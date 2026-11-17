// Ported from core.js — shared helpers

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function makeId(prefix?: string) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix || 'id'}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function wordCount(text: unknown) {
  return String(text || '').trim() ? String(text).trim().split(/\s+/).length : 0;
}

export function dateKey(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addLocalDays(value: Date | string | number, days: number) {
  const date = new Date(value instanceof Date ? value.getTime() : value);
  date.setDate(date.getDate() + Number(days || 0));
  return date;
}

export function hashText(text: unknown) {
  let hash = 5381;
  const value = String(text || '');
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  return (hash >>> 0).toString(16);
}

export function splitList(value: unknown) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  return String(value || '').split(/[;,；，,]/).map(item => item.trim()).filter(Boolean);
}

export function clipAtWord(text: unknown, max: number) {
  const value = String(text || '');
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(' ');
  const head = space > max / 3 ? cut.slice(0, space) : cut;
  return `${head.replace(/[\s,;:–—-]+$/, '')}…`;
}

export function firstSentence(text: unknown) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  const match = value.match(/^.+?[.!?。！？](?=\s|$)/);
  return clipAtWord(match ? match[0] : value, 140);
}

export function daysUntilExam(examDate?: string | null, now?: Date | string | number) {
  if (!examDate) return null;
  const exam = new Date(`${examDate}T00:00:00`);
  if (Number.isNaN(exam.getTime())) return null;
  const today = now ? new Date(now instanceof Date ? now.getTime() : now) : new Date();
  today.setHours(0, 0, 0, 0);
  exam.setHours(0, 0, 0, 0);
  return Math.round((exam.getTime() - today.getTime()) / 86400000);
}
