import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase, supabaseConfigured } from '../lib/supabase';
import { requestTimeout } from '../lib/requestTimeout';

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const supabase = getSupabase();
    let cancelled = false;
    requestTimeout(supabase.auth.getUser()).then(({ data }) => {
      if (!cancelled) setUser(data.user);
    }).catch(() => { /* AuthGate owns connection errors; keep a newer auth event. */ });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return user;
}
