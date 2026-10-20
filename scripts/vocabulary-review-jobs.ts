import { createHash } from 'node:crypto';
import { validateQualityCandidates, type QualityReport } from './vocabulary-quality';

export const reviewAreas = ['meaning-pos', 'example', 'collocations', 'distinctions', 'usage-register', 'teaching-context', 'optional-material'] as const;
export type ReviewReport = QualityReport & { sourceSnapshot: string };
type WorkItem = QualityReport['work'][number];
type Stage = 'unclaimed' | 'claimed' | 'draft' | 'source-unresolved' | 'checked' | 'integrated';
type WorkReference = Pick<WorkItem, 'workItemId' | 'entryId' | 'senseId' | 'sourceHash' | 'displayHash'> & { workFingerprint: string };
type CandidateReceipt = { workItemId: string; kind: 'field-repair' | 'complete-candidate'; candidateFingerprint: string };
export type ItemReview = { workItemId: string; workFingerprint: string; decision: 'retain' | 'change'; reviewedAreas: string[]; referenceUrl: string; rationale: string };
type TermReview = { reviewer: string; candidateFingerprint: string; items: ItemReview[] };
type History = { from: Stage; to: Stage; actor: string; reason?: string };
export type ReviewTerm = {
  term: string; workFingerprint: string; learning: boolean; sourceSenses: number; pendingSenses: number; work: WorkReference[];
  stage: Stage; owner: string | null; candidates: CandidateReceipt[]; sourceIssue: string | null;
  review: TermReview | null; integrationReference: string | null; history: History[];
};
type Package = { id: string; terms: string[]; pendingSenses: number; workFingerprint: string };
export type ReviewManifest = {
  schemaVersion: 1; sourceSnapshot: string; workFingerprint: string; targetPendingSenses: number;
  summary: { terms: number; sourceSenses: number; pendingSenses: number; workItems: number };
  packages: Package[]; terms: ReviewTerm[];
};
export type ReviewChange = {
  term: string; actor: string; workFingerprint: string; to: Exclude<Stage, 'unclaimed' | 'claimed'>;
  candidates?: unknown[]; reviews?: ItemReview[]; reason?: string; integrationReference?: string;
};

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => compare(a, b)).map(([key, row]) => [key, stable(row)]));
  return value;
}
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const equal = (a: unknown, b: unknown) => fingerprint(a) === fingerprint(b);
const termIdentity = (term: ReviewTerm) => ({ term: term.term, workFingerprint: term.workFingerprint, learning: term.learning, sourceSenses: term.sourceSenses, pendingSenses: term.pendingSenses, work: term.work });
const candidateFingerprint = (term: ReviewTerm) => fingerprint([...term.candidates].sort((a, b) => compare(a.workItemId, b.workItemId)));
const transitions: Record<Stage, Stage[]> = {
  unclaimed: ['claimed'], claimed: ['draft', 'source-unresolved'], draft: ['draft', 'source-unresolved', 'checked'],
  'source-unresolved': ['draft'], checked: ['integrated'], integrated: [],
};

/** Group the complete inventory, rather than selecting only signalled or current-learning fields. */
export function createReviewJobs(report: ReviewReport, options: { targetPendingSenses?: number } = {}) {
  const target = options.targetPendingSenses ?? 300;
  if (!Number.isSafeInteger(target) || target < 1 || target > 1000) throw new Error('Target pending senses must be 1–1000.');
  if (!/^[a-f0-9]{64}$/.test(report.sourceSnapshot || '') || !Array.isArray(report.work)) throw new Error('Expected a fingerprinted complete quality report.');
  const seen = new Set<string>(), grouped = new Map<string, WorkItem[]>();
  for (const item of report.work) {
    if (!text(item.term) || !text(item.workItemId) || !text(item.entryId) || !text(item.senseId) || !text(item.displayHash) || seen.has(item.workItemId)) throw new Error('Invalid or duplicate work identity.');
    seen.add(item.workItemId);
    grouped.set(item.term, [...(grouped.get(item.term) || []), item]);
  }
  const terms: ReviewTerm[] = [...grouped].map(([term, items]) => {
    const sorted = [...items].sort((a, b) => compare(a.workItemId, b.workItemId));
    const sources = sorted.filter(row => row.originalSense && row.reviewStatus !== 'context-review-required');
    const sourceIds = sources.map(row => JSON.stringify([row.entryId, row.senseId]));
    if (new Set(sourceIds).size !== sourceIds.length) throw new Error('Duplicate canonical source sense for term: ' + term);
    const work = sorted.map(row => ({ workItemId: row.workItemId, entryId: row.entryId, senseId: row.senseId, sourceHash: row.sourceHash, displayHash: row.displayHash, workFingerprint: fingerprint(row) }));
    return { term, workFingerprint: fingerprint(work), learning: sorted.some(row => row.scopes.length > 0), sourceSenses: sources.length,
      pendingSenses: sources.filter(row => row.reviewStatus === 'pending').length, work,
      stage: 'unclaimed', owner: null, candidates: [], sourceIssue: null, review: null, integrationReference: null, history: [] };
  });
  terms.sort((a, b) => Number(b.learning) - Number(a.learning) || Number(a.pendingSenses > target) - Number(b.pendingSenses > target) || compare(a.term, b.term));
  const batches: ReviewTerm[][] = [];
  let current: ReviewTerm[] = [], pending = 0;
  const flush = () => { if (current.length) batches.push(current); current = []; pending = 0; };
  for (const term of terms) {
    if (term.pendingSenses > target) { flush(); batches.push([term]); continue; }
    if (pending + term.pendingSenses > target) flush();
    current.push(term); pending += term.pendingSenses;
  }
  flush();
  const packages: Package[] = batches.map((batch, index) => ({ id: 'review-' + String(index + 1).padStart(4, '0'), terms: batch.map(row => row.term),
    pendingSenses: batch.reduce((sum, row) => sum + row.pendingSenses, 0), workFingerprint: fingerprint(batch.map(termIdentity)) }));
  const manifest: ReviewManifest = { schemaVersion: 1, sourceSnapshot: report.sourceSnapshot,
    workFingerprint: fingerprint([...terms].sort((a, b) => compare(a.term, b.term)).map(termIdentity)), targetPendingSenses: target,
    summary: { terms: terms.length, sourceSenses: terms.reduce((sum, row) => sum + row.sourceSenses, 0), pendingSenses: terms.reduce((sum, row) => sum + row.pendingSenses, 0), workItems: report.work.length }, packages, terms };
  if (manifest.summary.sourceSenses !== report.summary.dictionarySenses || manifest.summary.pendingSenses !== report.summary.pending ||
    manifest.summary.sourceSenses - manifest.summary.pendingSenses !== report.summary.reviewed) throw new Error('Incomplete source inventory: full quality-report totals must match.');
  return { manifest, packages: packages.map((batch, index) => ({ ...batch, sourceSnapshot: report.sourceSnapshot,
    terms: batches[index].map(term => ({ ...termIdentity(term), items: structuredClone(grouped.get(term.term)!) })) })) };
}

function checkReviews(term: ReviewTerm, review: TermReview) {
  if (!text(review.reviewer) || review.reviewer === term.owner) throw new Error('Complete review requires an independent reviewer.');
  if (review.candidateFingerprint !== candidateFingerprint(term)) throw new Error('Stale candidate review fingerprint.');
  if (!Array.isArray(review.items) || review.items.length !== term.work.length) throw new Error('Complete review must cover every exact work item.');
  const work = new Map(term.work.map(row => [row.workItemId, row])), seen = new Set<string>(), changed = new Set(term.candidates.map(row => row.workItemId));
  for (const row of review.items) {
    const item = work.get(row.workItemId);
    if (!item || seen.has(row.workItemId) || item.workFingerprint !== row.workFingerprint) throw new Error('Unknown, duplicate or stale review work fingerprint.');
    seen.add(row.workItemId);
    if (!Array.isArray(row.reviewedAreas) || !equal([...row.reviewedAreas].sort(compare), [...reviewAreas].sort(compare))) throw new Error('Complete review requires every review area.');
    if (!text(row.rationale) || !['retain', 'change'].includes(row.decision) || (row.decision === 'change') !== changed.has(row.workItemId)) throw new Error('Review disposition must match the exact candidate set and include a rationale.');
    try { const url = new URL(row.referenceUrl); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); }
    catch { throw new Error('Review requires an HTTPS evidence reference.'); }
  }
}

function verifyState(term: ReviewTerm) {
  let previous: Stage = 'unclaimed';
  for (const event of term.history) {
    if (event.from !== previous || !transitions[previous]?.includes(event.to) || !text(event.actor)) throw new Error('Illegal stage transition history: ' + term.term);
    if (event.to === 'checked' ? event.actor === term.owner : event.actor !== term.owner) throw new Error('Stage history owner/reviewer mismatch.');
    previous = event.to;
  }
  if (previous !== term.stage || (term.stage === 'unclaimed' ? term.owner !== null : !text(term.owner))) throw new Error('Invalid claim or stage: ' + term.term);
  const workIds = new Set(term.work.map(row => row.workItemId)), candidateIds = new Set<string>();
  for (const row of term.candidates) {
    if (!workIds.has(row.workItemId) || candidateIds.has(row.workItemId) || !['field-repair', 'complete-candidate'].includes(row.kind) || !/^[a-f0-9]{64}$/.test(row.candidateFingerprint)) throw new Error('Invalid or duplicate candidate receipt.');
    candidateIds.add(row.workItemId);
  }
  if (term.stage === 'source-unresolved' ? !text(term.sourceIssue) : term.sourceIssue !== null) throw new Error('Invalid source-unresolved disposition.');
  if (['checked', 'integrated'].includes(term.stage)) {
    if (!term.review) throw new Error('Missing complete review.');
    checkReviews(term, term.review);
    if (term.history.find(row => row.to === 'checked')?.actor !== term.review.reviewer) throw new Error('Review receipt does not match the checking actor.');
  } else if (term.review !== null) throw new Error('Unchecked term cannot carry complete review approval.');
  if (['unclaimed', 'claimed'].includes(term.stage) && term.candidates.length) throw new Error('Undrafted term cannot carry candidate receipts.');
  if (term.stage === 'integrated' ? !text(term.integrationReference) : term.integrationReference !== null) throw new Error('Invalid integration receipt.');
}

/** Reject stale inventory, edited package assignments and malformed workflow state before any mutation. */
export function verifyReviewManifest(manifest: ReviewManifest, report: ReviewReport) {
  const expected = createReviewJobs(report, { targetPendingSenses: manifest.targetPendingSenses }).manifest;
  if (manifest.schemaVersion !== 1 || manifest.sourceSnapshot !== expected.sourceSnapshot || manifest.workFingerprint !== expected.workFingerprint || !equal(manifest.summary, expected.summary)) throw new Error('Stale source snapshot or work inventory fingerprint.');
  if (!equal(manifest.packages, expected.packages) || !equal(manifest.terms.map(termIdentity), expected.terms.map(termIdentity))) throw new Error('Duplicate, missing or stale term/package fingerprint.');
  for (const term of manifest.terms) verifyState(term);
}

export function claimReviewPackage(manifest: ReviewManifest, report: ReviewReport, packageId: string, owner: string): ReviewManifest {
  verifyReviewManifest(manifest, report);
  if (!text(owner)) throw new Error('Claim requires a named owner.');
  const batch = manifest.packages.find(row => row.id === packageId);
  if (!batch) throw new Error('Unknown review package.');
  if (manifest.terms.some(row => batch.terms.includes(row.term) && row.stage !== 'unclaimed')) throw new Error('Package already has claimed terms or another owner.');
  const next = structuredClone(manifest);
  for (const row of next.terms.filter(row => batch.terms.includes(row.term))) {
    row.owner = owner; row.stage = 'claimed'; row.history.push({ from: 'unclaimed', to: 'claimed', actor: owner });
  }
  return next;
}

export function transitionReviewTerm(manifest: ReviewManifest, report: ReviewReport, change: ReviewChange): ReviewManifest {
  verifyReviewManifest(manifest, report);
  const original = manifest.terms.find(row => row.term === change.term);
  if (!original || original.workFingerprint !== change.workFingerprint) throw new Error('Unknown term or stale term work fingerprint.');
  if (!transitions[original.stage].includes(change.to)) throw new Error('Illegal stage transition, including unresolved or incomplete review.');
  if (!text(change.actor) || (change.to === 'checked' ? change.actor === original.owner : change.actor !== original.owner)) throw new Error(change.to === 'checked' ? 'Complete review requires an independent reviewer.' : 'Only the claim owner may change this term.');
  const allowed = new Set(['term', 'actor', 'workFingerprint', 'to', ...(change.to === 'draft' ? ['candidates', 'reason'] : change.to === 'source-unresolved' ? ['reason'] : change.to === 'checked' ? ['reviews'] : ['integrationReference'])]);
  if (Object.keys(change).some(key => !allowed.has(key))) throw new Error('Unsupported fields for stage transition.');
  const next = structuredClone(manifest), term = next.terms.find(row => row.term === change.term)!;
  if (change.to === 'source-unresolved' || original.stage === 'source-unresolved') {
    if (!text(change.reason)) throw new Error('Source issue/resolution requires a concrete reason.');
  }
  if (change.to === 'draft' && change.candidates !== undefined) {
    if (!Array.isArray(change.candidates)) throw new Error('Expected candidate array.');
    const validation = validateQualityCandidates(report, change.candidates);
    if (validation.errors.length) throw new Error('Invalid candidates: ' + validation.errors.join(' '));
    const ids = new Set(term.work.map(row => row.workItemId)), seen = new Set(term.candidates.map(row => row.workItemId));
    for (const value of change.candidates) {
      const row = value as Record<string, unknown>, id = String(row.workItemId);
      if (!ids.has(id)) throw new Error('Candidate is outside the claimed term.');
      if (seen.has(id)) throw new Error('Duplicate candidate work identity.');
      seen.add(id);
      term.candidates.push({ workItemId: id, kind: Object.hasOwn(row, 'changes') ? 'field-repair' : 'complete-candidate', candidateFingerprint: fingerprint(row) });
    }
  }
  if (change.to === 'checked') {
    const review = { reviewer: change.actor, candidateFingerprint: candidateFingerprint(term), items: structuredClone(change.reviews ?? []) };
    checkReviews(term, review); term.review = review;
  }
  if (change.to === 'integrated') {
    if (!text(change.integrationReference)) throw new Error('Integration requires an identifying reference.');
    term.integrationReference = change.integrationReference;
  }
  term.sourceIssue = change.to === 'source-unresolved' ? change.reason! : null;
  term.history.push({ from: term.stage, to: change.to, actor: change.actor, ...(change.reason ? { reason: change.reason } : {}) });
  term.stage = change.to;
  verifyState(term);
  return next;
}
