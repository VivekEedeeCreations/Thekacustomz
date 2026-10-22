import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Pencil,
  Trash2,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { RoleGate } from '@/components/auth/role-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDeletePettyEntry, useSettlePettyEntry } from '@/features/petty-book/mutations';
import {
  usePettyBalanceBefore,
  usePettyEntries,
  usePettyPending,
  type PettyEntry,
  type PettyEntryStatus,
  type PettyEntryType,
} from '@/features/petty-book/queries';
import { formatCurrency, formatDate, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';

import { daysUntil, periodFor, shiftAnchor, type PeriodKind } from './period';
import { PettyEntryDialog } from './petty-entry-dialog';

const ALL = 'ALL';
const PERIODS: { kind: PeriodKind; label: string }[] = [
  { kind: 'day', label: 'Daily' },
  { kind: 'week', label: 'Weekly' },
  { kind: 'month', label: 'Monthly' },
  { kind: 'year', label: 'Yearly' },
];
const monthNameFmt = new Intl.DateTimeFormat('en-IN', { month: 'long' });

function Stat({
  label,
  value,
  tone,
  hint,
  isLoading,
}: {
  label: string;
  value: number;
  tone?: 'income' | 'expense';
  hint?: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <p
            className={cn(
              'text-2xl font-semibold',
              tone === 'income' && 'text-emerald-600 dark:text-emerald-500',
              tone === 'expense' && 'text-destructive',
              !tone && value < 0 && 'text-destructive',
            )}
          >
            {formatCurrency(value)}
          </p>
        )}
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function sumBy(entries: PettyEntry[], type: PettyEntryType) {
  return entries.filter((e) => e.entry_type === type).reduce((s, e) => s + e.amount, 0);
}

export function PettyBookPage() {
  const today = todayIso();
  const [kind, setKind] = useState<PeriodKind>('month');
  const [anchor, setAnchor] = useState(today);
  const [typeFilter, setTypeFilter] = useState<PettyEntryType | typeof ALL>(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{
    entry: PettyEntry | null;
    type: PettyEntryType;
    status: PettyEntryStatus;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PettyEntry | null>(null);
  const [settling, setSettling] = useState<PettyEntry | null>(null);

  const period = periodFor(kind, anchor);
  const { data: entries, isLoading } = usePettyEntries(period.from, period.to);
  const { data: opening, isLoading: openingLoading } = usePettyBalanceBefore(period.from);
  const { data: pending, isLoading: pendingLoading } = usePettyPending();
  // Every settled entry ever — today's cash in hand.
  const { data: currentBalance, isLoading: currentLoading } = usePettyBalanceBefore('9999-12-31');
  const deleteEntry = useDeletePettyEntry();
  const settle = useSettlePettyEntry();

  // Running balance through the period (oldest first), then shown newest first.
  const withBalance = useMemo(() => {
    let balance = opening ?? 0;
    return [...(entries ?? [])]
      .reverse()
      .map((entry) => {
        balance += entry.entry_type === 'INCOME' ? entry.amount : -entry.amount;
        return { entry, balance };
      })
      .reverse();
  }, [entries, opening]);

  const income = sumBy(entries ?? [], 'INCOME');
  const expense = sumBy(entries ?? [], 'EXPENSE');

  const pendingTotals = useMemo(() => {
    const list = pending ?? [];
    const overdue = (type: PettyEntryType) =>
      list.filter((e) => e.entry_type === type && e.due_date && e.due_date < today).length;
    return {
      receivable: sumBy(list, 'INCOME'),
      payable: sumBy(list, 'EXPENSE'),
      overdueReceivable: overdue('INCOME'),
      overduePayable: overdue('EXPENSE'),
    };
  }, [pending, today]);

  // Yearly view: one row per month.
  const byMonth = useMemo(() => {
    if (kind !== 'year') return [];
    const rows = Array.from({ length: 12 }, (_, m) => ({ month: m, income: 0, expense: 0 }));
    for (const e of entries ?? []) {
      const row = rows[Number(e.entry_date.slice(5, 7)) - 1]!;
      if (e.entry_type === 'INCOME') row.income += e.amount;
      else row.expense += e.amount;
    }
    return rows;
  }, [entries, kind]);

  const categories = useMemo(
    () =>
      [...new Set([...(entries ?? []), ...(pending ?? [])].map((e) => e.category))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [entries, pending],
  );

  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries ?? []) {
      if (e.entry_type === 'EXPENSE') map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const term = search.trim().toLowerCase();
  const visible = withBalance.filter(({ entry }) => {
    if (typeFilter !== ALL && entry.entry_type !== typeFilter) return false;
    if (categoryFilter !== ALL && entry.category !== categoryFilter) return false;
    if (!term) return true;
    return [entry.category, entry.description, entry.reference, entry.payment_mode].some((v) =>
      v?.toLowerCase().includes(term),
    );
  });
  const filtered = typeFilter !== ALL || categoryFilter !== ALL || term !== '';

  const openDialog = (type: PettyEntryType, status: PettyEntryStatus = 'SETTLED') =>
    setDialog({ entry: null, type, status });

  return (
    <div>
      <PageHeader
        title="Petty book"
        description="Money in and out, what's still to be received or paid, and the running balance."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => openDialog('INCOME')}>
              <ArrowDownLeft className="h-4 w-4" />
              Add income
            </Button>
            <Button size="sm" onClick={() => openDialog('EXPENSE')}>
              <ArrowUpRight className="h-4 w-4" />
              Add expense
            </Button>
          </>
        }
      />

      {/* Receivables & payables ------------------------------------------------ */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4 text-muted-foreground" />
            To receive & to pay
          </h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => openDialog('INCOME', 'PENDING')}>
              Add receivable
            </Button>
            <Button variant="outline" size="sm" onClick={() => openDialog('EXPENSE', 'PENDING')}>
              Add payable
            </Button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="To receive"
            value={pendingTotals.receivable}
            tone="income"
            hint={
              pendingTotals.overdueReceivable > 0
                ? `${pendingTotals.overdueReceivable} overdue`
                : undefined
            }
            isLoading={pendingLoading}
          />
          <Stat
            label="To pay"
            value={pendingTotals.payable}
            tone="expense"
            hint={
              pendingTotals.overduePayable > 0
                ? `${pendingTotals.overduePayable} overdue`
                : undefined
            }
            isLoading={pendingLoading}
          />
          <Stat
            label="Balance after settling all"
            value={(currentBalance ?? 0) + pendingTotals.receivable - pendingTotals.payable}
            hint={`Cash in hand now: ${formatCurrency(currentBalance ?? 0)}`}
            isLoading={pendingLoading || currentLoading}
          />
        </div>
        {pending && pending.length > 0 ? (
          <div className="mt-4 rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Due</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Note / reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-48" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((entry) => {
                  const isIncome = entry.entry_type === 'INCOME';
                  const days = entry.due_date ? daysUntil(entry.due_date, today) : null;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap">
                        {entry.due_date ? formatDate(entry.due_date) : 'No due date'}
                        {days != null ? (
                          <Badge
                            variant={days < 0 ? 'destructive' : days <= 3 ? 'outline' : 'secondary'}
                            className="ml-2"
                          >
                            {days < 0 ? `${-days}d overdue` : days === 0 ? 'Today' : `in ${days}d`}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={isIncome ? 'success' : 'outline'}>
                            {isIncome ? 'Receivable' : 'Payable'}
                          </Badge>
                          {entry.category}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <span className="block truncate">
                          {entry.description || entry.reference || '—'}
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          'whitespace-nowrap text-right font-medium',
                          isIncome ? 'text-emerald-600 dark:text-emerald-500' : 'text-destructive',
                        )}
                      >
                        {formatCurrency(entry.amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="outline" size="sm" onClick={() => setSettling(entry)}>
                            <CheckCircle2 className="h-4 w-4" />
                            {isIncome ? 'Received' : 'Paid'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit"
                            onClick={() =>
                              setDialog({ entry, type: entry.entry_type, status: entry.status })
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <RoleGate min="ADMIN">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Delete"
                              onClick={() => setPendingDelete(entry)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </RoleGate>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </section>

      {/* Period ------------------------------------------------------------------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={kind} onValueChange={(v) => setKind(v as PeriodKind)}>
          <TabsList>
            {PERIODS.map((p) => (
              <TabsTrigger key={p.kind} value={p.kind}>
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous period"
            onClick={() => setAnchor((a) => shiftAnchor(kind, a, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="date"
            aria-label="Go to date"
            className="w-40"
            value={anchor}
            onChange={(e) => e.target.value && setAnchor(e.target.value)}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Next period"
            onClick={() => setAnchor((a) => shiftAnchor(kind, a, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {anchor !== today ? (
            <Button variant="ghost" size="sm" onClick={() => setAnchor(today)}>
              Today
            </Button>
          ) : null}
        </div>
        <span className="text-sm font-medium">{period.label}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Opening balance" value={opening ?? 0} isLoading={openingLoading} />
        <Stat label="Income" value={income} tone="income" isLoading={isLoading} />
        <Stat label="Expenses" value={expense} tone="expense" isLoading={isLoading} />
        <Stat
          label="Closing balance"
          value={(opening ?? 0) + income - expense}
          isLoading={isLoading || openingLoading}
        />
      </div>

      {kind === 'year' && !isLoading ? (
        <div className="mt-6 rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byMonth.map((row) => {
                const net = row.income - row.expense;
                const monthAnchor = `${period.from.slice(0, 4)}-${String(row.month + 1).padStart(2, '0')}-01`;
                return (
                  <TableRow
                    key={row.month}
                    className="cursor-pointer"
                    onClick={() => {
                      setKind('month');
                      setAnchor(monthAnchor);
                    }}
                  >
                    <TableCell className="font-medium">
                      {monthNameFmt.format(new Date(`${monthAnchor}T00:00:00`))}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600 dark:text-emerald-500">
                      {row.income ? formatCurrency(row.income) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-destructive">
                      {row.expense ? formatCurrency(row.expense) : '—'}
                    </TableCell>
                    <TableCell
                      className={cn('text-right font-medium', net < 0 && 'text-destructive')}
                    >
                      {row.income || row.expense ? formatCurrency(net) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {expenseByCategory.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {expenseByCategory.map(([category, amount]) => (
            <button
              key={category}
              type="button"
              onClick={() => {
                setTypeFilter('EXPENSE');
                setCategoryFilter(category);
              }}
            >
              <Badge variant="outline" className="cursor-pointer font-normal hover:bg-muted">
                {category} · {formatCurrency(amount)}
              </Badge>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mb-4 mt-6 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Search category, note, reference"
          className="sm:max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as PettyEntryType | typeof ALL)}
        >
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Income & expense</SelectItem>
            <SelectItem value="INCOME">Income only</SelectItem>
            <SelectItem value="EXPENSE">Expenses only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered ? (
          <Button
            variant="ghost"
            onClick={() => {
              setTypeFilter(ALL);
              setCategoryFilter(ALL);
              setSearch('');
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={filtered ? 'No entries match these filters' : `No entries for ${period.label}`}
          description={filtered ? undefined : 'Add income or an expense to get started.'}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Note / reference</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {!filtered ? <TableHead className="text-right">Balance</TableHead> : null}
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(({ entry, balance }) => {
                const isIncome = entry.entry_type === 'INCOME';
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(entry.entry_date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isIncome ? (
                          <ArrowDownLeft className="h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-destructive" />
                        )}
                        {entry.category}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {entry.description ? (
                        <span className="block truncate">{entry.description}</span>
                      ) : null}
                      {entry.reference ? (
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {entry.reference}
                        </span>
                      ) : null}
                      {!entry.description && !entry.reference ? (
                        <span className="text-muted-foreground">—</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.payment_mode || '—'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'whitespace-nowrap text-right font-medium',
                        isIncome ? 'text-emerald-600 dark:text-emerald-500' : 'text-destructive',
                      )}
                    >
                      {isIncome ? '+' : '−'} {formatCurrency(entry.amount)}
                    </TableCell>
                    {!filtered ? (
                      <TableCell
                        className={cn(
                          'whitespace-nowrap text-right',
                          balance < 0 && 'text-destructive',
                        )}
                      >
                        {formatCurrency(balance)}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <div className="flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit entry"
                          onClick={() =>
                            setDialog({ entry, type: entry.entry_type, status: entry.status })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <RoleGate min="ADMIN">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete entry"
                            onClick={() => setPendingDelete(entry)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </RoleGate>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PettyEntryDialog
        open={!!dialog}
        onOpenChange={(open) => !open && setDialog(null)}
        entry={dialog?.entry ?? null}
        defaultType={dialog?.type ?? 'EXPENSE'}
        defaultStatus={dialog?.status ?? 'SETTLED'}
        extraCategories={categories}
      />

      <ConfirmDialog
        open={!!settling}
        onOpenChange={(open) => !open && setSettling(null)}
        title={settling?.entry_type === 'INCOME' ? 'Mark as received?' : 'Mark as paid?'}
        description={
          settling
            ? `${settling.category} — ${formatCurrency(settling.amount)} will be recorded as ${
                settling.entry_type === 'INCOME' ? 'received' : 'paid'
              } today and added to the balance. Edit the entry afterwards to change the date.`
            : ''
        }
        confirmLabel={settling?.entry_type === 'INCOME' ? 'Received' : 'Paid'}
        onConfirm={async () => {
          if (!settling) return;
          try {
            await settle.mutateAsync({ id: settling.id, date: today });
            toast.success(
              settling.entry_type === 'INCOME' ? 'Marked as received' : 'Marked as paid',
            );
          } catch (error) {
            toast.error('Could not update entry', { description: (error as Error).message });
          }
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete entry?"
        description={
          pendingDelete
            ? `${pendingDelete.category} — ${formatCurrency(pendingDelete.amount)} will be removed.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteEntry.mutateAsync(pendingDelete.id);
            toast.success('Entry deleted');
          } catch (error) {
            toast.error('Could not delete entry', { description: (error as Error).message });
          }
        }}
      />
    </div>
  );
}
