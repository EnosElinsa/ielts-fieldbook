import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase, supabaseConfigured } from '../lib/supabase';

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const supabase = getSupabase();
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUser(data.user);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return user;
}
