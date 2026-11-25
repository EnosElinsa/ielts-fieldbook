/**
 * Regular English inflections used to recognise a headword inside an example or
 * definition. Matching is deliberately conservative: only whole, regular forms of
 * plain-letter headwords are produced, so `bat` never matches `battle` and
 * irregular forms stay the job of the reviewed `form` data.
 */
const vowels = /[aeiou]/;
const doublingFinal = /[bdgklmnprstvz]/;
const letters = /^[a-z]+$/;

/** True for a final consonant-vowel-consonant that a suffix may double (bat -> batted). */
function endsConsonantVowelConsonant(source: string): boolean {
  // The u of "qu" is a glide, so quiz and equip double like consonant-vowel-consonant words.
  const word = source.replace(/qu/g, 'q');
  const [a, b, c] = word.slice(-3);
  return word.length >= 3 && !vowels.test(a) && vowels.test(b) && doublingFinal.test(c) && !vowels.test(c);
}

function thirdPersonOrPlural(word: string): string[] {
  const forms: string[] = [];
  if (/[^aeiou]y$/.test(word)) forms.push(`${word.slice(0, -1)}ies`);
  else forms.push(`${word}s`);
  // -es covers sibilants and -o words (heroes, potatoes); both spellings are harmless to try.
  if (/(?:s|x|z|ch|sh|o)$/.test(word)) forms.push(`${word}es`);
  // Doubled sibilant: bus -> busses, quiz -> quizzes.
  if (/[sz]$/.test(word) && endsConsonantVowelConsonant(word)) forms.push(`${word}${word.slice(-1)}es`);
  return forms;
}

function pastForms(word: string): string[] {
  const forms: string[] = [];
  if (/[^aeiou]y$/.test(word)) forms.push(`${word.slice(0, -1)}ied`);
  else if (word.endsWith('e')) forms.push(`${word}d`);
  else forms.push(`${word}ed`);
  if (endsConsonantVowelConsonant(word)) forms.push(`${word}${word.slice(-1)}ed`);
  if (word.endsWith('c')) forms.push(`${word}ked`);
  return forms;
}

function progressiveForms(word: string): string[] {
  const forms: string[] = [];
  if (word.endsWith('ie')) forms.push(`${word.slice(0, -2)}ying`);
  // Silent-e drop (make -> making); -ee/-oe/-ye keep it (seeing, shoeing, dyeing).
  if (/e$/.test(word) && !/[eoy]e$/.test(word)) forms.push(`${word.slice(0, -1)}ing`);
  forms.push(`${word}ing`);
  if (endsConsonantVowelConsonant(word)) forms.push(`${word}${word.slice(-1)}ing`);
  if (word.endsWith('c')) forms.push(`${word}king`);
  return forms;
}

function verbForms(word: string): string[] {
  return [...thirdPersonOrPlural(word), ...pastForms(word), ...progressiveForms(word)];
}

const canonicalPos = (pos?: string) => {
  const value = (pos || '').trim().toLowerCase();
  // A bare "phrase" may be a verb phrase or a noun phrase, so it behaves like an unknown class.
  return value === 'v' ? 'verb' : value === 'n' ? 'noun' : value === 'phrase' || value === 'word' || value === 'other' || value === 'unknown' ? '' : value;
};

/**
 * Regular inflected forms of a headword, lower-cased and never including the
 * headword itself. `pos` limits forms to that class (verb -> -s/-ed/-ing, noun ->
 * plural); with no `pos` every regular form is returned. Multi-word terms inflect
 * the head word (the first word of a verb phrase, the last word of a noun phrase).
 * Terms containing anything but plain ASCII letters (digits, hyphens, accents) and
 * head words shorter than three letters get no extra forms.
 */
export function regularWordForms(term: string, pos?: string): string[] {
  const words = term.trim().toLowerCase().split(/\s+/);
  if (!words[0] || words.some(word => !letters.test(word))) return [];
  const cls = canonicalPos(pos);
  if (cls && cls !== 'verb' && cls !== 'noun') return [];
  const last = words.length - 1;
  const inflect = (slot: number, forms: (word: string) => string[]) =>
    words[slot].length < 3 ? [] : forms(words[slot]).map(form => words.map((word, index) => index === slot ? form : word).join(' '));
  const forms = cls === 'verb' ? inflect(0, verbForms)
    : cls === 'noun' ? inflect(last, thirdPersonOrPlural)
    // Unknown class (for example concealing an answer): any regular form could be the target.
    : last === 0 ? inflect(0, verbForms) : [...inflect(0, verbForms), ...inflect(last, thirdPersonOrPlural)];
  return [...new Set(forms)].filter(form => form !== words.join(' '));
}
