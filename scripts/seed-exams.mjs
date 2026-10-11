#!/usr/bin/env node
/** Administrator-only shared catalog seed. Dry run is the default; never deletes rows. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { validateCatalog } from './lib/exam-import.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node scripts/seed-exams.mjs [--dry-run | --apply] [--catalog FILE] [--assets DIR] [--audit FILE] [--manifest FILE]\nDefaults: local/exam-bank/catalog.json, local/exam-bank/assets, sibling audit.json. Dry run validates every asset and prints counts/checksums. --apply requires SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(0);
}
const options = { apply: false, catalog: path.join(root, 'local/exam-bank/catalog.json'), assets: path.join(root, 'local/exam-bank/assets'), audit: null, manifest: null };
for (let index = 0; index < args.length; index++) {
  const flag = args[index];
  if (flag === '--apply') options.apply = true;
  else if (flag === '--dry-run') { if (args.includes('--apply')) throw new Error('Choose --dry-run or --apply, not both.'); }
  else if (['--catalog', '--assets', '--audit', '--manifest'].includes(flag)) {
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    options[flag.slice(2)] = path.resolve(value);
  } else throw new Error(`Unknown argument ${flag}.`);
}

const sha256 = value => createHash('sha256').update(value).digest('hex');
const bytes = await fs.readFile(options.catalog);
const catalog = JSON.parse(bytes.toString('utf8'));
const validation = validateCatalog(catalog);
if (validation.errors.length) throw new Error(`Catalog has ${validation.errors.length} audit errors; inspect its audit.json before seeding.`);
let savedAudit;
try { savedAudit = JSON.parse(await fs.readFile(options.audit || path.join(path.dirname(options.catalog), 'audit.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (savedAudit?.errors?.length) throw new Error(`Saved audit has ${savedAudit.errors.length} errors; rebuild the bank before seeding.`);
const tables = { exam_papers: catalog.papers, exam_sections: catalog.sections, exam_passages: catalog.passages, exam_questions: catalog.questions, exam_assets: catalog.assets };
const paperIds = new Set(catalog.papers.map(paper => paper.id));
const sectionIds = new Set(catalog.sections.map(section => section.id));
const assetIds = new Set(catalog.assets.map(asset => asset.id));
const mandatory = [];
if (!catalog.papers.length || !catalog.sections.length || !catalog.questions.length) mandatory.push('Catalog has no practice content.');
for (const [table, records] of Object.entries(tables)) {
  const ids = new Set();
  for (const row of records) {
    if (!row.id || ids.has(row.id)) mandatory.push(`Missing/duplicate identifier in ${table}.`);
    ids.add(row.id);
    if (!row.provenance?.sourceUrl || !row.provenance?.contentHash || !row.provenance?.authorization) mandatory.push(`Missing provenance in ${table}.`);
  }
}
for (const section of catalog.sections) {
  if (!paperIds.has(section.paperId)) mandatory.push(`Missing paper for ${section.id}.`);
  if (section.status !== 'ready') mandatory.push(`Section ${section.id} is incomplete.`);
  const questions = catalog.questions.filter(question => question.sectionId === section.id);
  if (!questions.length || questions.reduce((total, question) => total + (question.points || 1), 0) !== section.questionCount) mandatory.push(`Question-count mismatch in ${section.id}.`);
  if (section.skill === 'listening' && (!section.assetId || !assetIds.has(section.assetId) || !section.sentences?.length)) mandatory.push(`Missing listening audio/transcript in ${section.id}.`);
  if (section.skill === 'reading' && !catalog.passages.some(passage => passage.sectionId === section.id && passage.paragraphs?.some(paragraph => paragraph.text?.trim()))) mandatory.push(`Missing reading passage in ${section.id}.`);
}
for (const row of [...catalog.questions, ...catalog.passages, ...catalog.assets]) {
  if (row.paperId && !paperIds.has(row.paperId)) mandatory.push(`Missing paper for ${row.id}.`);
  if (row.sectionId && !sectionIds.has(row.sectionId)) mandatory.push(`Missing section for ${row.id}.`);
}
for (const question of catalog.questions) {
  if (question.assetId && !assetIds.has(question.assetId)) mandatory.push(`Missing question asset for ${question.id}.`);
  for (const match of String(question.stimulusHtml || '').matchAll(/exam-asset:([^"'<>\s]+)/g)) if (!assetIds.has(match[1])) mandatory.push(`Missing stimulus asset for ${question.id}.`);
  if (/src=["']https?:/i.test(question.stimulusHtml || '')) mandatory.push(`Unmirrored stimulus image in ${question.id}.`);
}
// Learning records and exported browser credentials must never enter a shared bank.
function personal(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => ['cookie', 'cookies', 'access_token', 'refresh_token', 'service_role_key', 'user_id', 'uid', 'mobile', 'responses', 'transcriptInput', 'selfRating', 'user_audio', 'select_answer', 'evaluate_result'].includes(key) || personal(child));
}
if (personal(catalog)) mandatory.push('Shared catalog contains account data or credentials.');
if (mandatory.length) throw new Error(`${mandatory.length} missing/invalid mandatory content records. ${mandatory.slice(0, 8).join(' ')}`);

const contentTypes = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
const assets = [];
const paths = new Set();
for (const asset of catalog.assets) {
  if (asset.unavailable) throw new Error(`Asset ${asset.id} is marked unavailable.`);
  const relative = asset.storagePath;
  if (!relative || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(part => !part || part === '..' || part === '.')) throw new Error(`Unsafe storage path for ${asset.id}.`);
  const filename = path.resolve(options.assets, relative);
  const contentType = contentTypes[path.extname(filename).toLowerCase()];
  if (!contentType || !contentType.startsWith(`${asset.kind}/`)) throw new Error(`Unsupported asset type for ${asset.id}.`);
  const realRoot = await fs.realpath(options.assets), realFile = await fs.realpath(filename);
  if (!realFile.startsWith(realRoot + path.sep)) throw new Error(`Asset ${asset.id} escapes the asset directory.`);
  const buffer = await fs.readFile(filename);
  if (!buffer.length) throw new Error(`Asset ${asset.id} is empty.`);
  if (paths.has(relative)) continue;
  paths.add(relative);
  assets.push({ storagePath: relative, file: filename, contentType, bytes: buffer.length, sha256: sha256(buffer) });
}
const manifest = { mode: options.apply ? 'apply' : 'dry-run', schemaVersion: 1, catalogSha256: sha256(bytes),
  counts: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length])),
  answerSlots: catalog.questions.reduce((sum, question) => sum + (question.points || 1), 0),
  assets: { count: assets.length, bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0), sha256: sha256(JSON.stringify(assets.map(({ storagePath, sha256: digest }) => ({ storagePath, sha256: digest })).sort((a, b) => a.storagePath.localeCompare(b.storagePath)))) },
  warnings: validation.warnings,
};
if (options.manifest) {
  await fs.mkdir(path.dirname(options.manifest), { recursive: true });
  await fs.writeFile(options.manifest, JSON.stringify(manifest, null, 2));
}
console.log(JSON.stringify(manifest, null, 2));
if (!options.apply) process.exit(0);

// Environment variables win over local files. No secret or endpoint is printed.
for (const envfile of ['.env.local', '.env']) {
  let text;
  try { text = await fs.readFile(path.join(root, envfile), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  for (const line of text.split(/\r?\n/)) {
    const pair = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (pair && !process.env[pair[1]]) process.env[pair[1]] = pair[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const endpoint = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!endpoint || !key) throw new Error('--apply requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
const url = new URL(endpoint);
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Remote seed endpoints must use HTTPS.');
const client = createClient(endpoint, key, { auth: { persistSession: false, autoRefreshToken: false } });
async function workers(items, action) {
  let index = 0, stopped = false;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (!stopped && index < items.length) {
      const item = items[index++];
      try { await action(item); } catch (error) { stopped = true; throw error; }
    }
  }));
}
let assetCount = 0, reusedCount = 0;
await workers(assets, async asset => {
  const bucket = client.storage.from('exam-assets');
  const { data: existing } = await bucket.info(asset.storagePath);
  if (existing?.metadata?.sha256 === asset.sha256 && existing.size === asset.bytes) reusedCount++;
  else {
    const buffer = await fs.readFile(asset.file);
    for (let attempt = 0; ; attempt++) {
      const { error } = await bucket.upload(asset.storagePath, buffer, { contentType: asset.contentType, upsert: true, metadata: { sha256: asset.sha256 } });
      if (!error) break;
      const status = Number(error.statusCode || 0);
      if (attempt >= 3 || (status >= 400 && status < 500 && status !== 408 && status !== 429)) throw new Error(`Exam asset upload failed (${status || 'storage error'}). Catalog rows were not seeded; retry is safe.`);
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  assetCount++;
  if (assetCount % 10 === 0 || assetCount === assets.length) console.log(`Assets ready: ${assetCount}/${assets.length} (${reusedCount} verified unchanged).`);
});
for (const [table, records] of Object.entries(tables)) {
  const batches = [];
  for (let offset = 0; offset < records.length; offset += 100) batches.push(records.slice(offset, offset + 100).map(record => ({ id: record.id, payload: record, updated_at: new Date().toISOString() })));
  await workers(batches, async rows => {
    const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw new Error(`Exam seed failed for ${table} (${error.code || 'database error'}). No rows were pruned; retry is safe.`);
  });
  console.log(`Seeded ${table}: ${records.length} rows.`);
}
console.log('Seed complete. Private assets and shared catalog rows are uploaded; personal practice rows were untouched.');
