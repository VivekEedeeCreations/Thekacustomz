import {
  EXCHANGE_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  RETURN_STATUS_LABELS,
  type ExchangeStatus,
  type OrderStatus,
  type ReturnStatus,
} from '@inventory/shared';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const BLUE =
  'border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300';
const AMBER =
  'border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300';
const GREEN =
  'border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300';
const RED =
  'border-red-200 bg-red-100 text-red-900 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300';
const GREY =
  'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/15 dark:text-slate-300';

const ORDER_STYLES: Record<OrderStatus, string> = {
  NEW: GREY,
  DISPATCH_READY: AMBER,
  DISPATCHED: BLUE,
  DELIVERED: GREEN,
  CANCELLED: RED,
};

const RETURN_STYLES: Record<ReturnStatus, string> = {
  REQUESTED: GREY,
  AUTHORIZED: BLUE,
  REJECTED: RED,
  RECEIVED: AMBER,
  REFUNDED: GREEN,
};

const EXCHANGE_STYLES: Record<ExchangeStatus, string> = {
  REQUESTED: GREY,
  APPROVED: BLUE,
  REJECTED: RED,
  DISPATCHED: AMBER,
  COMPLETED: GREEN,
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', ORDER_STYLES[status])}>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', RETURN_STYLES[status])}>
      {RETURN_STATUS_LABELS[status]}
    </Badge>
  );
}

export function ExchangeStatusBadge({ status }: { status: ExchangeStatus }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', EXCHANGE_STYLES[status])}>
      {EXCHANGE_STATUS_LABELS[status]}
    </Badge>
  );
}
