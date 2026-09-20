import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TablesInsert } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export function useCreateMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<'inventory_movements'>) => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
    },
  });
}
