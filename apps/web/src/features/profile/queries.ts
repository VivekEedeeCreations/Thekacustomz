import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export type Profile = Tables<'profiles'>;

export function profileQueryKey(userId: string | undefined) {
  return ['profile', userId] as const;
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: profileQueryKey(userId),
    queryFn: async (): Promise<Profile | null> => {
      if (!userId) return null;
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}

export function useAllProfiles() {
  return useQuery({
    queryKey: ['profiles', 'all'],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
