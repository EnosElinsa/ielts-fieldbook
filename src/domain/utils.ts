// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
// Ported from core.js — shared helpers

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function makeId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${prefix || 'id'}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function wordCount(text) {
  return String(text || '').trim() ? String(text).trim().split(/\s+/).length : 0;
}

export function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addLocalDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + Number(days || 0));
  return date;
}

export function hashText(text) {
  let hash = 5381;
  const value = String(text || '');
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  return (hash >>> 0).toString(16);
}

export function splitList(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  return String(value || '').split(/[;,；，,]/).map(item => item.trim()).filter(Boolean);
}

export function firstSentence(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  const match = value.match(/^.+?[.!?。！？](?=\s|$)/);
  return (match ? match[0] : value).slice(0, 140);
}

export function daysUntilExam(examDate, now) {
  if (!examDate) return null;
  const exam = new Date(`${examDate}T00:00:00`);
  if (Number.isNaN(exam.getTime())) return null;
  const today = now ? new Date(now) : new Date();
  today.setHours(0, 0, 0, 0);
  exam.setHours(0, 0, 0, 0);
  return Math.round((exam.getTime() - today.getTime()) / 86400000);
}
