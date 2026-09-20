import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  Json,
  OrderStatus,
  SalesChannel,
  TablesInsert,
  TablesUpdate,
} from '@inventory/shared';

import { supabase } from '@/lib/supabase';

export interface NewOrderHeader {
  sales_channel: SalesChannel;
  external_order_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  shipping_address?: string;
  location_id?: string;
  order_date?: string;
  courier_name?: string;
  awb_number?: string;
  discount_amount?: number;
  shipping_amount?: number;
  notes?: string;
}

export interface NewOrderItem {
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  unit_price: number;
  discount_amount?: number;
  tax_rate: number;
}

/** Orders drive stock (dispatch-ready takes it out, undo/cancel puts it back), so refresh those too. */
function invalidateOrders(queryClient: QueryClient) {
  for (const key of ['orders', 'order-items', 'inventory', 'inventory-movements']) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/** Creates an order and its lines atomically (public.create_order). Resolves to the new order id. */
export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { header: NewOrderHeader; items: NewOrderItem[] }) => {
      const { data, error } = await supabase.rpc('create_order', {
        p_order: input.header as unknown as Json,
        p_items: input.items as unknown as Json,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: TablesUpdate<'orders'> & { id: string }) => {
      const { data, error } = await supabase
        .from('orders')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

/**
 * Moves an order along its status flow. The database enforces which moves are
 * legal and posts/restores stock — e.g. NEW → DISPATCH_READY takes it out of
 * the location, DISPATCH_READY → NEW puts it back.
 */
export function useSetOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const { data, error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

export function useAddOrderItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TablesInsert<'order_items'>) => {
      const { data, error } = await supabase.from('order_items').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}

export function useDeleteOrderItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('order_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateOrders(queryClient),
  });
}
