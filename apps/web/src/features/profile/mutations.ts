import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UserRole } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

/** Admin-only: change another user's role or active flag (enforced by RLS + DB trigger). */
export function useUpdateProfileRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; role?: UserRole; is_active?: boolean }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from('profiles').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profiles'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useUpdateOwnProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; full_name: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: input.full_name })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
