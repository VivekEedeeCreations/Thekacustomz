import { useQuery } from '@tanstack/react-query';
import type { Tables } from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export type Order = Tables<'orders'>;
export type OrderItem = Tables<'order_items'>;

const ORDER_LIMIT = 1000;

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(ORDER_LIMIT);
      if (error) throw error;
      return data;
    },
    staleTime: 10_000,
  });
}

export function useOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ['orders', orderId],
    queryFn: async (): Promise<Order> => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId as string)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
  });
}

export async function fetchOrderItems(orderId: string): Promise<OrderItem[]> {
  const { data, error } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at');
  if (error) throw error;
  return data;
}

export function useOrderItems(orderId: string | undefined) {
  return useQuery({
    queryKey: ['order-items', orderId],
    queryFn: () => fetchOrderItems(orderId as string),
    enabled: !!orderId,
  });
}
