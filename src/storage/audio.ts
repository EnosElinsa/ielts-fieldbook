import { getSupabase, supabaseConfigured } from '../lib/supabase';
import { accountGeneration, accountId } from './accountIdentity';

const BUCKET = 'recordings';

async function objectPath(audioId: string, expectedOwner?: string | null) {
  const generation = accountGeneration();
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (expectedOwner !== undefined && (userId !== expectedOwner || accountId() !== expectedOwner || generation !== accountGeneration())) throw new Error('Account changed while accessing recording');
  if (!userId) throw new Error('Sign in to store a recording');
  return `${userId}/${audioId}`;
}

export async function putAudio(audioId: string, blob: Blob, expectedOwner?: string | null): Promise<void> {
  if (!audioId || !blob || !supabaseConfigured()) throw new Error('Recording storage is unavailable');
  const supabase = getSupabase();
  const generation = accountGeneration();
  const path = await objectPath(audioId, expectedOwner);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type || 'audio/webm',
  });
  if (error) throw error;
  if (expectedOwner !== undefined && (expectedOwner !== accountId() || generation !== accountGeneration())) throw new Error('Account changed while uploading recording');
}

export async function getAudio(audioId: string): Promise<Blob | null> {
  if (!audioId || !supabaseConfigured()) return null;
  const supabase = getSupabase();
  const path = await objectPath(audioId);
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return data;
}

export async function deleteAudio(audioId: string): Promise<void> {
  if (!audioId || !supabaseConfigured()) return;
  const supabase = getSupabase();
  const path = await objectPath(audioId);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function hasAudio(audioId: string): Promise<boolean> {
  const blob = await getAudio(audioId);
  return Boolean(blob && blob.size);
}
