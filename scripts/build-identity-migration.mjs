import fs from 'node:fs';
const mapping = JSON.parse(fs.readFileSync('src/domain/vocabulary/identityMapping.json', 'utf8'));
const rows = [...mapping.books.flatMap(row => [['book', row.oldId, row.id], ['book', row.sourceBookId, row.id], ['unit', `starter:${row.sourceBookId}`, `${row.id}-editorial-starter`]]), ...mapping.units.flatMap(row => [['unit', row.oldId, row.id], ['unit', row.oldStorageId, row.id]]), ...mapping.memberships.map(row => ['membership', row.oldId, row.id])];
const sql = `insert into public.vocabulary_identity_aliases(kind,old_id,neutral_id) select v->>0,v->>1,v->>2 from jsonb_array_elements($identities$${JSON.stringify(rows)}$identities$::jsonb) a(v) on conflict(kind,old_id) do update set neutral_id=excluded.neutral_id;`;
fs.writeFileSync('supabase/migrations/20261013160000_neutral_vocabulary_identities.sql', fs.readFileSync('supabase/neutral-vocabulary-template.sql', 'utf8').replace('__IDENTITY_VALUES__', sql));
console.log(`Generated ${rows.length} fixed identity aliases.`);
