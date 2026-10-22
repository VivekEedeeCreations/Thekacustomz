import { useEffect, useId, useState } from 'react';
import { Eye, EyeOff, Landmark, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { RoleGate } from '@/components/auth/role-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  useCreateBankAccount,
  useDeleteBankAccount,
  useUpdateBankAccount,
} from '@/features/bank-accounts/mutations';
import { useBankAccounts, type BankAccount } from '@/features/bank-accounts/queries';
import { formatCurrency, formatDate, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';

/** A balance older than this is flagged as possibly out of date. */
const STALE_AFTER_DAYS = 7;

function maskNumber(value: string): string {
  const digits = value.trim();
  return digits.length <= 4 ? digits : `•••• ${digits.slice(-4)}`;
}

function daysAgo(date: string): number {
  const then = new Date(`${date}T00:00:00`).getTime();
  const today = new Date(`${todayIso()}T00:00:00`).getTime();
  return Math.round((today - then) / 86_400_000);
}

function BankAccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Account being edited, or null to add one. */
  account: BankAccount | null;
}) {
  const ids = {
    name: useId(),
    bank: useId(),
    number: useId(),
    balance: useId(),
    asOf: useId(),
    notes: useId(),
    active: useId(),
  };
  const create = useCreateBankAccount();
  const update = useUpdateBankAccount();
  const pending = create.isPending || update.isPending;

  const [name, setName] = useState('');
  const [bank, setBank] = useState('');
  const [number, setNumber] = useState('');
  const [balance, setBalance] = useState('');
  const [asOf, setAsOf] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(account?.account_name ?? '');
    setBank(account?.bank_name ?? '');
    setNumber(account?.account_number ?? '');
    setBalance(account ? String(account.current_balance) : '');
    // Updating a balance usually means "as of today".
    setAsOf(todayIso());
    setNotes(account?.notes ?? '');
    setActive(account?.is_active ?? true);
  }, [open, account]);

  const save = async () => {
    const accountNumber = number.replace(/\s+/g, '');
    const value = Number(balance);
    if (!name.trim()) {
      toast.error('Enter the account name');
      return;
    }
    if (accountNumber.length < 4) {
      toast.error('Enter the account number (at least 4 characters)');
      return;
    }
    if (balance.trim() === '' || !Number.isFinite(value)) {
      toast.error('Enter the current balance');
      return;
    }
    const payload = {
      account_name: name.trim(),
      bank_name: bank.trim() || null,
      account_number: accountNumber,
      current_balance: Math.round(value * 100) / 100,
      balance_as_of: asOf || todayIso(),
      notes: notes.trim() || null,
      is_active: active,
    };
    try {
      if (account) await update.mutateAsync({ id: account.id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(account ? 'Bank account updated' : 'Bank account added');
      onOpenChange(false);
    } catch (error) {
      toast.error('Could not save bank account', { description: (error as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? 'Update bank account' : 'Add bank account'}</DialogTitle>
          <DialogDescription>
            Type the balance shown in your bank app or statement. It isn&apos;t calculated from
            petty entries.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={ids.name}>Account name</Label>
            <Input
              id={ids.name}
              maxLength={120}
              placeholder="e.g. Thekacustomz current account"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={!account}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ids.number}>Account number</Label>
              <Input
                id={ids.number}
                inputMode="numeric"
                autoComplete="off"
                maxLength={40}
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.bank}>Bank (optional)</Label>
              <Input
                id={ids.bank}
                maxLength={120}
                placeholder="e.g. HDFC Bank"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ids.balance}>Current balance</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
                  ₹
                </span>
                <Input
                  id={ids.balance}
                  type="number"
                  step="0.01"
                  className="pl-7"
                  placeholder="0.00"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  autoFocus={!!account}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.asOf}>Balance as of</Label>
              <Input
                id={ids.asOf}
                type="date"
                max={todayIso()}
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.notes}>Notes (optional)</Label>
            <Textarea
              id={ids.notes}
              rows={2}
              placeholder="IFSC, branch, what this account is used for…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {account ? (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor={ids.active} className="font-normal">
                Active (counted in the total)
              </Label>
              <Switch id={ids.active} checked={active} onCheckedChange={setActive} />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {account ? 'Save' : 'Add account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BankAccountsSection({
  cashInHand,
  cashLoading,
}: {
  /** Net of all settled petty entries. */
  cashInHand: number;
  cashLoading: boolean;
}) {
  const { data: accounts, isLoading } = useBankAccounts();
  const deleteAccount = useDeleteBankAccount();
  const [dialog, setDialog] = useState<{ account: BankAccount | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BankAccount | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const active = (accounts ?? []).filter((a) => a.is_active);
  const bankTotal = active.reduce((sum, a) => sum + a.current_balance, 0);

  const toggleReveal = (id: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          Bank accounts
        </h3>
        <Button variant="outline" size="sm" onClick={() => setDialog({ account: null })}>
          <Plus className="h-4 w-4" />
          Add bank account
        </Button>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">In bank</p>
            {isLoading ? (
              <Skeleton className="mt-1 h-7 w-24" />
            ) : (
              <p className={cn('text-2xl font-semibold', bankTotal < 0 && 'text-destructive')}>
                {formatCurrency(bankTotal)}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {active.length} active account{active.length === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Cash in hand</p>
            {cashLoading ? (
              <Skeleton className="mt-1 h-7 w-24" />
            ) : (
              <p className={cn('text-2xl font-semibold', cashInHand < 0 && 'text-destructive')}>
                {formatCurrency(cashInHand)}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">From petty book entries</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total funds</p>
            {isLoading || cashLoading ? (
              <Skeleton className="mt-1 h-7 w-24" />
            ) : (
              <p
                className={cn(
                  'text-2xl font-semibold',
                  bankTotal + cashInHand < 0 && 'text-destructive',
                )}
              >
                {formatCurrency(bankTotal + cashInHand)}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Bank + cash in hand</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !accounts || accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No bank accounts yet. Add one with its current balance to see total funds.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {accounts.map((account) => {
            const shown = revealed.has(account.id);
            const age = daysAgo(account.balance_as_of);
            return (
              <div
                key={account.id}
                className={cn(
                  'flex flex-col gap-3 p-3 sm:flex-row sm:items-center',
                  !account.is_active && 'opacity-60',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{account.account_name}</span>
                    {account.bank_name ? (
                      <span className="text-sm text-muted-foreground">{account.bank_name}</span>
                    ) : null}
                    {!account.is_active ? <Badge variant="outline">Inactive</Badge> : null}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1">
                    <span className="font-mono text-sm">
                      {shown ? account.account_number : maskNumber(account.account_number)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label={shown ? 'Hide account number' : 'Show account number'}
                      onClick={() => toggleReveal(account.id)}
                    >
                      {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                  {account.notes ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{account.notes}</p>
                  ) : null}
                </div>
                <div className="sm:text-right">
                  <p
                    className={cn(
                      'text-lg font-semibold',
                      account.current_balance < 0 && 'text-destructive',
                    )}
                  >
                    {formatCurrency(account.current_balance)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    as of {formatDate(account.balance_as_of)}
                    {age > STALE_AFTER_DAYS ? (
                      <Badge variant="outline" className="ml-2">
                        {age} days old
                      </Badge>
                    ) : null}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setDialog({ account })}>
                    <Pencil className="h-4 w-4" />
                    Update balance
                  </Button>
                  <RoleGate min="ADMIN">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${account.account_name}`}
                      onClick={() => setPendingDelete(account)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </RoleGate>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BankAccountDialog
        open={!!dialog}
        onOpenChange={(open) => !open && setDialog(null)}
        account={dialog?.account ?? null}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete bank account?"
        description={`"${pendingDelete?.account_name}" will be removed from the petty book. To keep it but leave it out of the total, mark it inactive instead.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteAccount.mutateAsync(pendingDelete.id);
            toast.success('Bank account deleted');
          } catch (error) {
            toast.error('Could not delete bank account', {
              description: (error as Error).message,
            });
          }
        }}
      />
    </section>
  );
}
