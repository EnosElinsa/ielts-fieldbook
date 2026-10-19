import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { hasVocabularySenseEdits, learningTask } from '../../src/domain/vocabulary/content';
import { supplementVocabularySense } from '../../src/domain/vocabulary/readiness';
import type { VocabularyEntry, VocabularySense } from '../../src/domain/vocabulary/types';

const catalog = JSON.parse(readFileSync('public/vocabulary-catalog.json', 'utf8'));
const index = JSON.parse(readFileSync('public/dictionary/index.json', 'utf8'));
const terms = 'charity|mental|and|bandage|discomfort|irrigation|landscape|lung|ownership|picture|resource|southwest|tube|van|assort|backpack|beach|beggar|bias|breed|corridor|dean|deficiency|driver|exclude|glimpse|hazardous|immense|intelligent|irregular|nutrition|proclaim|psychologist|railway station|royal|secondly|see|sideways|sportsman|toil|trailer|transit|writing|analyze|anthropologist|astound|captive|come|commentary|community|continent|deduce|delegation|depart|desert|eaves|emerge|error|expose|extinction|fraction|guardian|hairdressing|inability|interference|invisible|island|labour|lawn|mainland|martial|negatively|noxious|pacific|pamphlet|paramount|patriot|peer|postpone|preview|pronounce|rake|reasonable|redundant|remind|reside|slum|smooth|stern|subgroup|swarm|swim|tender|thaw|unwelcome|variation|version|viaduct'.split('|');
const sourceIds: Record<string, string> = {
  "charity": "kaikki:3c8fdf130e021433e7",
  "mental": "kaikki:2302fbc18b8762cc55",
  "and": "kaikki:7e31145226ef121309",
  "bandage": "kaikki:8894cf27002f19e409",
  "discomfort": "kaikki:806e3e8e1ec5c002ef",
  "irrigation": "kaikki:ffdb907c5c910eeec6",
  "landscape": "kaikki:bd42786b79b31f865e",
  "lung": "kaikki:00b82d8d861cc33374",
  "ownership": "kaikki:4e86da5e174a9445e4",
  "picture": "kaikki:2a4f58f537c2809f63",
  "resource": "kaikki:47c07be2b5d539f4eb",
  "southwest": "kaikki:aad7b05d9849379427",
  "tube": "kaikki:9dc310433d6d176d9b",
  "van": "kaikki:72ca59b37a1745d1ea",
  "assort": "kaikki:e4f1aa0b919ab5341f",
  "backpack": "kaikki:cb45ac9095f65d325c",
  "beach": "kaikki:4948b87050851d07fa",
  "beggar": "kaikki:d0f72db6718c476c14",
  "bias": "kaikki:d6394c059d8e06af3b",
  "breed": "kaikki:56b1d80453a5c1fe8e",
  "corridor": "kaikki:4a6daf54e246b6ac7b",
  "dean": "kaikki:727362a60ef715b729",
  "deficiency": "kaikki:1affc08c8db3b78111",
  "driver": "kaikki:ea36c205df14493741",
  "exclude": "kaikki:62e9b57b3da7b16108",
  "glimpse": "kaikki:5ef5478976a0864161",
  "hazardous": "kaikki:99c3cc65853325b1ed",
  "immense": "kaikki:def100d54a6139aeb1",
  "intelligent": "kaikki:c9a2c7a826459ee17c",
  "irregular": "kaikki:8caf0de3ab525e0b46",
  "nutrition": "kaikki:13dec217abf941eaa0",
  "proclaim": "kaikki:cb7b9d8f7c70ef9c45",
  "psychologist": "kaikki:32bf641c3b82da14a1",
  "railway station": "kaikki:2e5292b8ba5521c86a",
  "royal": "kaikki:28b704d68d7b914a27",
  "secondly": "kaikki:9b2c50199848192e8b",
  "see": "kaikki:4e7b3292129ee6bf84",
  "sideways": "kaikki:d16727d7286a75e773",
  "sportsman": "kaikki:84df9d6d81dc2c60d6",
  "toil": "kaikki:c592317d062c98c343",
  "trailer": "kaikki:2299444bb4c83c5073",
  "transit": "kaikki:f2cfb3d56b821b2e76",
  "writing": "kaikki:4861a7f296a469ddb9",
  "analyze": "kaikki:c4e462f8ecffd6d1e3",
  "anthropologist": "kaikki:9bc44a602d521ee883",
  "astound": "kaikki:73ad240552e98540ab",
  "captive": "kaikki:8dfadc15fb5ea75067",
  "come": "kaikki:2ea8f08bec8229f0aa",
  "commentary": "kaikki:694e107119526a78b0",
  "community": "kaikki:371922564ce79ccb49",
  "continent": "kaikki:78222c3b1edd22ac40",
  "deduce": "kaikki:7a25f300257e815af4",
  "delegation": "kaikki:dcbfba9cbd60793778",
  "depart": "kaikki:3ea6360611bc5bdf12",
  "desert": "kaikki:be9a01e35685a6a0dd",
  "eaves": "kaikki:a0ee6f5752220bfd04",
  "emerge": "kaikki:9d723997cf98a898b2",
  "error": "kaikki:a480d975404d2f0085",
  "expose": "kaikki:7e98e62029b96a69a6",
  "extinction": "kaikki:cf2db2816f8ff20540",
  "fraction": "kaikki:ab598b772945af1a8f",
  "guardian": "kaikki:ed3c3d930faac9341b",
  "hairdressing": "kaikki:4da35750cad2009190",
  "inability": "kaikki:b65555f096dac72668",
  "interference": "kaikki:72611a94ae6b0eb14c",
  "invisible": "kaikki:df6e3c74f83bb4d08c",
  "island": "kaikki:d1f6f920af40d4b837",
  "labour": "kaikki:474e6e749e5c321ad8",
  "lawn": "kaikki:146a1e59e5360da370",
  "mainland": "kaikki:d9f30ceeaf0a598510",
  "martial": "kaikki:2ad236bcd6288f7e61",
  "negatively": "kaikki:52bf2a2493d2531d44",
  "noxious": "kaikki:b271aeb6eab8caf462",
  "pacific": "kaikki:12a0711db0041001d6",
  "pamphlet": "kaikki:ef7de4edbf446a8a3b",
  "paramount": "kaikki:dc82368fb929e2213b",
  "patriot": "kaikki:b2ed10f42b72663e42",
  "peer": "kaikki:9d43dc55a068aa3aff",
  "postpone": "kaikki:59cdc07e31fd4a18f6",
  "preview": "kaikki:2559203bb290246329",
  "pronounce": "kaikki:a3c8f0e4ed847ecdfa",
  "rake": "kaikki:d61f29d07cc443096f",
  "reasonable": "kaikki:dc474ba967752a6f91",
  "redundant": "kaikki:d64a497ac66a4a8f76",
  "remind": "kaikki:d38e084f200819e939",
  "reside": "kaikki:830d87e9077cf53dd6",
  "slum": "kaikki:931ae96700113fb9a8",
  "smooth": "kaikki:7129e5bfe8e6fb09a8",
  "stern": "kaikki:dc6dad932da6c48d5f",
  "subgroup": "kaikki:16eba8c103d1e0bf2f",
  "swarm": "kaikki:fa0f2ad77d304e96d3",
  "swim": "kaikki:dc8de1202a4ac7bde2",
  "tender": "kaikki:022688d32c3e112471",
  "thaw": "kaikki:bb44517a85c1200d95",
  "unwelcome": "kaikki:3289908f12bb4e7469",
  "variation": "kaikki:942ad5dab6dab4fdfb",
  "version": "kaikki:bd03dfa1184205b00c",
  "viaduct": "kaikki:237a90cc7d525cfc74"
};
function current(term: string) {
  const entry = catalog.entries.find((row: VocabularyEntry) => row.term === term) as VocabularyEntry;
  const dictionary = JSON.parse(readFileSync('public/dictionary/' + index[term], 'utf8')).senses as VocabularySense[];
  const raw = dictionary.find(sense => sense.id === sourceIds[term])!;
  expect(raw, term + ' preserved source').toBeDefined();
  return { entry, raw, dictionary, sense: supplementVocabularySense(entry.id, raw, dictionary, hasVocabularySenseEdits) };
}

test.each(terms)('%s has a complete usable example for its formerly truncated learning meaning', term => {
  const { entry, raw, dictionary, sense } = current(term);
  expect(sense.example).not.toMatch(/\[\s*(?:…|\.{3})\s*\]|\b(?:thou|thee|hath)\b|ſ/);
  expect(sense.example.toLowerCase()).toContain(term.toLowerCase());
  expect(sense.collocations?.length).toBeGreaterThan(1);
  expect(sense.distinctions?.length).toBeGreaterThan(0);
  expect(learningTask({ ...entry, senses: [sense] }, sense, 'cloze')).toBeDefined();
  expect(supplementVocabularySense(entry.id, { ...raw, example: 'My own saved sentence.', source: 'Personal note' }, dictionary, hasVocabularySenseEdits).example).toBe('My own saved sentence.');
});

test('cross-word notes retain actual semantic and construction boundaries', () => {
  expect(current('mainland').sense.distinctions?.join(' ')).toMatch(/need not mean a separate continent/);
  expect(current('smooth').sense.distinctions?.join(' ')).toMatch(/curved object can have a smooth surface/);
  expect(current('irregular').sense.distinctions?.join(' ')).toMatch(/not therefore an incorrect verb/);
  expect(current('subgroup').sense.distinctions?.join(' ')).toMatch(/mathematics.*entire group/);
  expect(current('postpone').sense.usage).toMatch(/postpone signing/);
  expect(current('remind').sense.usage).toMatch(/remind me to send/);
  expect(current('psychologist').sense.distinctions?.join(' ')).toMatch(/psychiatrist is a medical doctor/);
  expect(current('ownership').sense.distinctions?.join(' ')).toMatch(/does not by itself establish ownership/);
  expect(current('slum').sense.distinctions?.join(' ')).toMatch(/not a description of.*residents/);
});
