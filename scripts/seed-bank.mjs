import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function readBank(name) {
  const privatePath = path.join(root, 'local', name);
  const samplePath = path.join(root, 'public', 'sample', name);
  return JSON.parse(fs.readFileSync(fs.existsSync(privatePath) ? privatePath : samplePath, 'utf8'));
}

function rowsFromList(list) {
  return list.map((item) => ({
    id: String(item.id),
    payload: item,
    updated_at: new Date().toISOString(),
  }));
}

async function prune(supabase, table, keepIds) {
  const keep = new Set(keepIds);
  const { data, error } = await supabase.from(table).select('id');
  if (error) throw error;
  const extra = (data || []).map((row) => row.id).filter((id) => !keep.has(id));
  if (!extra.length) return 0;
  const { error: deleteError } = await supabase.from(table).delete().in('id', extra);
  if (deleteError) throw deleteError;
  return extra.length;
}

async function upsert(supabase, table, rows) {
  const size = 200;
  for (let index = 0; index < rows.length; index += size) {
    const chunk = rows.slice(index, index + size);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) throw error;
  }
}

if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.');
  process.exit(1);
}

const writing = readBank('questions.json');
const speaking = readBank('speaking-questions.json');
const samples = readBank('speaking-samples.json');
const topics = Array.isArray(speaking) ? speaking : speaking.topics || [];
const byId = samples.byId || {};

const supabase = createClient(url, key, { auth: { persistSession: false } });
const writingRows = rowsFromList(writing);
const topicRows = rowsFromList(topics);
const sampleRows = Object.keys(byId).map((id) => ({
  id,
  payload: byId[id],
  updated_at: new Date().toISOString(),
}));
await upsert(supabase, 'writing_questions', writingRows);
await upsert(supabase, 'speaking_topics', topicRows);
await upsert(supabase, 'speaking_samples', sampleRows);
const removedWriting = await prune(supabase, 'writing_questions', writingRows.map((row) => row.id));
const removedSpeaking = await prune(supabase, 'speaking_topics', topicRows.map((row) => row.id));
const removedSamples = await prune(supabase, 'speaking_samples', sampleRows.map((row) => row.id));
console.log(`Seeded ${writing.length} writing questions, ${topics.length} speaking topics, ${Object.keys(byId).length} sample sets.`);
if (removedWriting || removedSpeaking || removedSamples) {
  console.log(`Removed ${removedWriting} writing, ${removedSpeaking} speaking, ${removedSamples} sample rows that are not in this bank.`);
}
