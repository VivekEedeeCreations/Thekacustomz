import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { matchesSearch, type SearchableOption } from '@/lib/search';
import { cn } from '@/lib/utils';

/** Rendering thousands of rows makes typing sluggish; the search narrows it down instead. */
const MAX_SHOWN = 200;

/**
 * A select whose list can be searched by typing. Keyboard: type to filter, ↑/↓ to move,
 * Enter to pick, Esc to close.
 */
export type { SearchableOption };

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Type to search…',
  emptyText = 'Nothing matches.',
  className,
  id,
  'aria-label': ariaLabel,
}: {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  id?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const matches = useMemo(() => options.filter((o) => matchesSearch(o, query)), [options, query]);
  const shown = matches.slice(0, MAX_SHOWN);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const index = options.findIndex((o) => o.value === value);
    setActive(index >= 0 && index < MAX_SHOWN ? index : 0);
    // Only when opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (option: SearchableOption | undefined) => {
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(shown[active]);
    }
  };

  return (
    // `modal` keeps the list scrollable when this sits inside a Dialog.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] min-w-72 p-0"
        onOpenAutoFocus={(e) => {
          // Focus the search box, not the first focusable thing.
          e.preventDefault();
          (e.currentTarget as HTMLElement).querySelector('input')?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 opacity-50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label={searchPlaceholder}
          />
        </div>
        <div ref={listRef} role="listbox" className="max-h-72 overflow-y-auto p-1">
          {shown.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            shown.map((option, index) => (
              <div
                key={option.value}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(option)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                  index === active && 'bg-accent text-accent-foreground',
                  option.disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <Check
                  className={cn(
                    'h-4 w-4 shrink-0',
                    option.value === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="truncate">{option.label}</span>
                {option.hint ? (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                ) : null}
              </div>
            ))
          )}
          {matches.length > MAX_SHOWN ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              Showing {MAX_SHOWN} of {matches.length} — keep typing to narrow down.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
