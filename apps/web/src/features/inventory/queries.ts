import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export type InventoryRow = Tables<'inventory'>;
export type InventoryMovement = Tables<'inventory_movements'>;

export function useInventory() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn: async (): Promise<InventoryRow[]> => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 15_000,
  });
}

export function useInventoryMovements(limit = 100) {
  return useQuery({
    queryKey: ['inventory-movements', limit],
    queryFn: async (): Promise<InventoryMovement[]> => {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
    staleTime: 15_000,
  });
}
