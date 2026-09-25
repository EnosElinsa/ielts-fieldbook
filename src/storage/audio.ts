import { getSupabase, supabaseConfigured } from '../lib/supabase';

const BUCKET = 'recordings';

async function objectPath(audioId: string) {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) throw new Error('Sign in to store a recording');
  return `${userId}/${audioId}`;
}

export async function putAudio(audioId: string, blob: Blob): Promise<void> {
  if (!audioId || !blob || !supabaseConfigured()) return;
  const supabase = getSupabase();
  const path = await objectPath(audioId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type || 'audio/webm',
  });
  if (error) throw error;
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
