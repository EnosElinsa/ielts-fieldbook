import { wordCount } from './utils';

export const SECTION_KEYS = ['intro', 'overview', 'position', 'pointA', 'pointB', 'paragraph'] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];
export type DeskSections = Record<SectionKey, string>;
export type DeskMode =
  | 'overview'
  | 'outline'
  | 'compare'
  | 'body'
  | 'timed'
  | 'full'
  | 'speak-blind'
  | string;

export function emptySections(): DeskSections {
  return {
    intro: '',
    overview: '',
    position: '',
    pointA: '',
    pointB: '',
    paragraph: '',
  };
}

export function normalizeSections(raw: unknown): DeskSections {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = emptySections();
  SECTION_KEYS.forEach((key) => {
    out[key] = String(source[key] ?? '');
  });
  return out;
}

function joinParts(parts: string[]): string {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join('\n\n');
}

/** Fragment modes stitch section fields into one essay; timed/full use free text. */
export function composeEssay(
  mode: DeskMode,
  sections: Partial<DeskSections> | null | undefined,
  freeText: string | null | undefined,
): string {
  const fields = normalizeSections(sections);
  if (mode === 'overview') return joinParts([fields.intro, fields.overview]);
  if (mode === 'outline') return joinParts([fields.position, fields.pointA, fields.pointB]);
  if (mode === 'compare' || mode === 'body') return String(fields.paragraph || '').trim();
  return String(freeText || '').trim();
}

export type WritingChecks = Record<string, boolean | undefined>;

const TASK1_CHECKS = ['series', 'units', 'time', 'overview'] as const;
const TASK2_CHECKS = ['prompt', 'position', 'body'] as const;

function requiredFilled(values: string[]): boolean {
  return values.every((value) => String(value || '').trim().length > 0);
}

/**
 * Hard save blockers for the writing desk. Empty array means the save modal may open.
 * Speaking / speak-blind modes return no writing blockers.
 * Soft word-count confirms for timed/full are handled in the UI, not here.
 */
export function writingSaveBlockers(
  mode: DeskMode,
  taskType: string | number | null | undefined,
  essay: string,
  checks: WritingChecks | null | undefined,
  sections?: Partial<DeskSections> | null,
): string[] {
  if (mode === 'speak-blind' || String(mode || '').startsWith('speak')) return [];

  const fields = normalizeSections(sections);
  const text = String(essay || composeEssay(mode, fields, essay) || '').trim();
  const words = wordCount(text);
  const blockers: string[] = [];
  const box = checks || {};

  if (mode === 'overview') {
    if (!requiredFilled([fields.intro, fields.overview])) {
      blockers.push('Fill both the introduction and the overview.');
    } else if (words > 120) {
      blockers.push('Overview practice stays under 120 words.');
    }
    return blockers;
  }

  if (mode === 'outline') {
    if (!requiredFilled([fields.position, fields.pointA, fields.pointB])) {
      blockers.push('Fill your position and both points.');
    } else if (words > 120) {
      blockers.push('Outline practice stays under 120 words.');
    }
    return blockers;
  }

  if (mode === 'compare' || mode === 'body') {
    if (words < 40) blockers.push('Write at least 40 words for this paragraph.');
    else if (words > 180) blockers.push('This paragraph practice stays under 180 words.');
    return blockers;
  }

  if (mode === 'timed' || mode === 'full' || !mode) {
    if (!text) {
      blockers.push('Write something first.');
      return blockers;
    }
    const keys = String(taskType) === '2' ? TASK2_CHECKS : TASK1_CHECKS;
    const missing = keys.some((key) => !box[key]);
    if (missing) {
      blockers.push(
        String(taskType) === '2'
          ? 'Tick the question, position, and two-paragraph checks before saving.'
          : 'Tick series, units, time, and overview before saving.',
      );
    }
  }

  return blockers;
}

export function fragmentFieldsFilled(mode: DeskMode, sections: Partial<DeskSections> | null | undefined): boolean {
  const fields = normalizeSections(sections);
  if (mode === 'overview') return requiredFilled([fields.intro, fields.overview]);
  if (mode === 'outline') return requiredFilled([fields.position, fields.pointA, fields.pointB]);
  if (mode === 'compare' || mode === 'body') return requiredFilled([fields.paragraph]);
  return true;
}

export function writingWordSoftConfirm(
  mode: DeskMode,
  taskType: string | number | null | undefined,
  essay: string,
): string | null {
  if (mode !== 'timed' && mode !== 'full') return null;
  const words = wordCount(essay);
  const minimum = String(taskType) === '2' ? 250 : 150;
  if (words >= minimum) return null;
  return `This draft is under ${minimum} words (${words}). Save it anyway?`;
}
