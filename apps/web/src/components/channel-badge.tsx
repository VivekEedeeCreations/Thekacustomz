import { SALES_CHANNEL_LABELS, type SalesChannel } from '@inventory/shared';

import { Badge } from '@/components/ui/badge';
import { CHANNEL_STYLES } from '@/lib/sales-channels';
import { cn } from '@/lib/utils';

export function ChannelBadge({
  channel,
  className,
}: {
  channel: SalesChannel;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(CHANNEL_STYLES[channel].badge, className)}>
      {SALES_CHANNEL_LABELS[channel]}
    </Badge>
  );
}
