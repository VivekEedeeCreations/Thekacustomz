import { SALES_CHANNEL_LABELS, type SalesChannel } from '@inventory/shared';

import { CHANNEL_STYLES, PRIMARY_CHANNELS, type ChannelFilterValue } from '@/lib/sales-channels';
import { cn } from '@/lib/utils';

/**
 * Pill filter across sales channels with live counts. The five main channels are
 * always shown; the others (Myntra/Manual/Other) appear only once they have rows.
 */
export function ChannelFilter({
  value,
  onChange,
  counts,
}: {
  value: ChannelFilterValue;
  onChange: (next: ChannelFilterValue) => void;
  counts: Partial<Record<SalesChannel, number>>;
}) {
  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const extra = (['MYNTRA', 'MANUAL', 'OTHER'] as const).filter((c) => (counts[c] ?? 0) > 0);
  const channels: SalesChannel[] = [...PRIMARY_CHANNELS, ...extra];

  const pill = (active: boolean, activeClass: string) =>
    cn(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition-colors',
      active ? activeClass : 'text-muted-foreground hover:bg-accent',
    );

  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by channel">
      <button
        type="button"
        role="tab"
        aria-selected={value === 'ALL'}
        className={pill(value === 'ALL', 'border-primary bg-primary text-primary-foreground')}
        onClick={() => onChange('ALL')}
      >
        All <span className="text-xs opacity-80">{total}</span>
      </button>
      {channels.map((c) => (
        <button
          key={c}
          type="button"
          role="tab"
          aria-selected={value === c}
          className={pill(value === c, cn(CHANNEL_STYLES[c].badge, 'ring-1 ring-current'))}
          onClick={() => onChange(c)}
        >
          {SALES_CHANNEL_LABELS[c]} <span className="text-xs opacity-80">{counts[c] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
