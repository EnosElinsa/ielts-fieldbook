import { getSupabase } from '../lib/supabase';
import { requestTimeout } from '../lib/requestTimeout';
import { accountId, accountGeneration } from './accountIdentity';
import type { StudySkill, StudyPlan } from '../domain/plans';

/** Display-only rows: never merge these projections into the writable account store. */
export type ProgressPlan = Pick<StudyPlan, 'id' | 'title' | 'dateKey' | 'status'>;
export type ProgressPlanQuery = {
  skill: StudySkill; from?: string; to: string;
  status?: StudyPlan['status'] | 'all'; offset?: number; limit?: number;
};

export async function loadProgressPlans(options: ProgressPlanQuery) {
  const owner = accountId(), generation = accountGeneration();
  if (!owner) throw new Error('Sign in to load study plans.');
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit || 20)));
  const offset = Math.max(0, Math.floor(options.offset || 0));
  // Older rows can predate the explicit skill field. Match the same legacy kinds
  // as planSkill without downloading the entire account to classify them.
  const speaking = 'speaking-p1,speaking-p2,speaking-p3,stories,speaking-mock';
  const legacy = options.skill === 'speaking' ? `payload->>kind.in.(${speaking})`
    : options.skill === 'vocabulary' ? 'payload->>kind.in.(vocabulary,lexicon)'
    : options.skill === 'reading' || options.skill === 'listening' ? `payload->>kind.like.${options.skill}*`
    : `or(payload->>kind.is.null,and(payload->>kind.not.in.(${speaking},vocabulary,lexicon),payload->>kind.not.like.reading*,payload->>kind.not.like.listening*))`;
  const skillFilter = `payload->>skill.eq.${options.skill},and(payload->>skill.is.null,${legacy})`;
  const filter = options.status === 'pending'
    ? `and(or(${skillFilter}),or(payload->>status.eq.pending,payload->>status.is.null))` : skillFilter;
  let query = getSupabase().from('plans')
    .select('id,title:payload->>title,dateKey:payload->>dateKey,status:payload->>status', { count: 'exact' })
    .eq('user_id', owner)
    .or(filter)
    .lte('payload->>dateKey', options.to);
  if (options.from) query = query.gte('payload->>dateKey', options.from);
  if (options.status && options.status !== 'all' && options.status !== 'pending') query = query.eq('payload->>status', options.status);
  const { data, count, error, status: responseStatus } = await requestTimeout(Promise.resolve(query
    .order('payload->>dateKey', { ascending: false }).order('id', { ascending: true })
    .range(offset, offset + limit - 1)), 15_000);
  if (owner !== accountId() || generation !== accountGeneration()) throw new Error('Account load superseded');
  if (error) {
    if (responseStatus === 416) throw new Error('This study plan page is no longer available. Retry from the first page.');
    throw error;
  }
  if (!Array.isArray(data) || !Number.isSafeInteger(count)) throw new Error('Study plans could not be read. Retry shortly.');
  const plans: ProgressPlan[] = data.map(row => {
    const status = row.status ?? 'pending';
    if (typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.dateKey !== 'string'
      || !['pending', 'in_progress', 'completed', 'skipped'].includes(status)) throw new Error('Invalid study plan summary. Retry shortly.');
    return { id: row.id, title: row.title, dateKey: row.dateKey, status: status as StudyPlan['status'] };
  });
  return { plans, total: count as number, offset, limit };
}
