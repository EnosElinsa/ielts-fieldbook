import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const mappingPath = path.join(root, 'src/domain/vocabulary/identityMapping.json');
const catalogPath = path.join(root, 'public/vocabulary-catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const bookIds = ['ielts-vocabulary', 'ielts-reading-keywords', 'ielts-listening-vocabulary', 'ielts-listening-essentials', 'ielts-listening-practice-21', 'ielts-listening-practice-20'];
let mapping;
if (fs.existsSync(mappingPath)) mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
else {
  const books = catalog.books.map((book, index) => ({ oldId: book.id, id: bookIds[index], sourceBookId: book.sourceBookId }));
  const units = catalog.units.map(unit => {
    const book = books.find(book => book.oldId === unit.bookId);
    const chapter = unit.kind === 'chapter' ? unit : catalog.units.find(row => row.bookId === unit.bookId && row.id === unit.parentId);
    const chapterId = `${book.id}-chapter-${String(chapter.order + 1).padStart(2, '0')}`;
    return { oldId: unit.id, oldStorageId: `${unit.bookId}:${unit.id}`, id: unit.kind === 'chapter' ? chapterId : `${chapterId}-group-${String(unit.order + 1).padStart(2, '0')}`, bookId: book.id, sourceUnitId: unit.sourceUnitId };
  });
  const memberships = catalog.memberships.map(member => ({ oldId: member.id, id: `${units.find(unit => unit.oldId === member.unitId).id}-member-${String(member.order + 1).padStart(3, '0')}`, entryId: member.entryId }));
  mapping = { version: 1, books, units, memberships };
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2) + '\n');
}
const aliases = new Map([...mapping.books.flatMap(row => [[row.oldId, row.id], [row.sourceBookId, row.id], [`starter:${row.sourceBookId}`, `${row.id}-editorial-starter`]]), ...mapping.units.flatMap(row => [[row.oldId, row.id], [row.oldStorageId, row.id]]), ...mapping.memberships.map(row => [row.oldId, row.id])]);
const fields = new Set(['id', 'bookId', 'unitId', 'parentId', 'membershipId', 'sourceId']);
const provenance = new Set(['sourceRecord', 'sourceReports', 'record', 'reports']);
function convert(value, field = '') {
  if (provenance.has(field)) return value;
  if (Array.isArray(value)) return value.map(row => convert(row, field));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, row]) => [aliases.get(key) || key, convert(row, key)]));
  return typeof value === 'string' && fields.has(field) ? aliases.get(value) || value : value;
}
for (const file of [catalogPath, path.join(root,'public/vocabulary-content-manifest.json'), ...fs.readdirSync(path.join(root, 'src/domain/vocabulary')).filter(file => file.endsWith('.json')).map(file => path.join(root, 'src/domain/vocabulary', file))]) {
  const before = fs.readFileSync(file, 'utf8');
  const after = convert(JSON.parse(before));
  const original = execFileSync('git', ['show', `HEAD:${path.relative(root, file).replaceAll('\\', '/')}`], { cwd: root, maxBuffer: 30 * 1024 * 1024, encoding: 'utf8' });
  fs.writeFileSync(file, JSON.stringify(after, null, original.includes('\n  ') ? 2 : undefined) + (original.endsWith('\n') ? '\n' : ''));
}
console.log(`Fixed mappings: ${mapping.books.length} books, ${mapping.units.length} units, ${mapping.memberships.length} memberships.`);
