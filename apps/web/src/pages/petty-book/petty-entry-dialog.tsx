import { useEffect, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useCreatePettyEntry, useUpdatePettyEntry } from '@/features/petty-book/mutations';
import type { PettyEntry, PettyEntryStatus, PettyEntryType } from '@/features/petty-book/queries';
import { todayIso } from '@/lib/format';

const INCOME_CATEGORIES = [
  'Cash sale',
  'Owner contribution',
  'Refund received',
  'Marketplace payout',
  'Other income',
];
const EXPENSE_CATEGORIES = [
  'Packaging',
  'Courier / shipping',
  'Raw material',
  'Printing',
  'Travel',
  'Food & tea',
  'Salary / wages',
  'Rent',
  'Electricity & internet',
  'Marketing',
  'Repairs',
  'Other expense',
];
const PAYMENT_MODES = ['Cash', 'UPI', 'Bank transfer', 'Card'];

export function PettyEntryDialog({
  open,
  onOpenChange,
  entry,
  defaultType,
  defaultStatus = 'SETTLED',
  extraCategories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Entry being edited, or null to add one. */
  entry: PettyEntry | null;
  defaultType: PettyEntryType;
  /** PENDING opens it as a receivable/payable. */
  defaultStatus?: PettyEntryStatus;
  /** Categories already used, offered alongside the built-in suggestions. */
  extraCategories: string[];
}) {
  const ids = {
    date: useId(),
    due: useId(),
    amount: useId(),
    category: useId(),
    categoryList: useId(),
    mode: useId(),
    modeList: useId(),
    reference: useId(),
    description: useId(),
  };
  const create = useCreatePettyEntry();
  const update = useUpdatePettyEntry();
  const pending = create.isPending || update.isPending;

  const [type, setType] = useState<PettyEntryType>(defaultType);
  const [status, setStatus] = useState<PettyEntryStatus>(defaultStatus);
  const [date, setDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [mode, setMode] = useState('Cash');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!open) return;
    setType(entry?.entry_type ?? defaultType);
    setStatus(entry?.status ?? defaultStatus);
    setDate(entry?.entry_date ?? todayIso());
    setDueDate(entry?.due_date ?? '');
    setAmount(entry ? String(entry.amount) : '');
    setCategory(entry?.category ?? '');
    setMode(entry ? (entry.payment_mode ?? '') : 'Cash');
    setReference(entry?.reference ?? '');
    setDescription(entry?.description ?? '');
  }, [open, entry, defaultType, defaultStatus]);

  const isPending = status === 'PENDING';
  const pendingLabel = type === 'INCOME' ? 'To receive' : 'To pay';
  const doneLabel = type === 'INCOME' ? 'Received' : 'Paid';

  const suggestions = [
    ...new Set([
      ...(type === 'INCOME' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES),
      ...extraCategories,
    ]),
  ];

  const save = async () => {
    const value = Number(amount);
    if (!(value > 0)) {
      toast.error('Enter an amount greater than 0');
      return;
    }
    if (!category.trim()) {
      toast.error('Choose or type a category');
      return;
    }
    if (!date) {
      toast.error('Pick a date');
      return;
    }
    const payload = {
      entry_type: type,
      entry_date: date,
      status,
      due_date: isPending ? dueDate || null : null,
      amount: Math.round(value * 100) / 100,
      category: category.trim(),
      payment_mode: mode.trim() || null,
      reference: reference.trim() || null,
      description: description.trim() || null,
    };
    try {
      if (entry) await update.mutateAsync({ id: entry.id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(
        entry
          ? 'Entry updated'
          : isPending
            ? type === 'INCOME'
              ? 'Receivable added'
              : 'Payable added'
            : type === 'INCOME'
              ? 'Income added'
              : 'Expense added',
      );
      onOpenChange(false);
    } catch (error) {
      toast.error('Could not save entry', { description: (error as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry ? 'Edit entry' : 'New entry'}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Tabs value={type} onValueChange={(v) => setType(v as PettyEntryType)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="EXPENSE">Expense (money out)</TabsTrigger>
              <TabsTrigger value="INCOME">Income (money in)</TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={status} onValueChange={(v) => setStatus(v as PettyEntryStatus)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="SETTLED">{doneLabel} already</TabsTrigger>
              <TabsTrigger value="PENDING">
                {pendingLabel} later ({type === 'INCOME' ? 'receivable' : 'payable'})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ids.date}>{isPending ? 'Recorded on' : `${doneLabel} on`}</Label>
              <Input
                id={ids.date}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.amount}>Amount</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
                  ₹
                </span>
                <Input
                  id={ids.amount}
                  type="number"
                  min="0"
                  step="0.01"
                  className="pl-7"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
          </div>

          {isPending ? (
            <div className="space-y-1.5">
              <Label htmlFor={ids.due}>Due date (optional)</Label>
              <Input
                id={ids.due}
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ids.category}>Category</Label>
              <Input
                id={ids.category}
                list={ids.categoryList}
                maxLength={60}
                placeholder="Pick or type"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <datalist id={ids.categoryList}>
                {suggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.mode}>Paid / received by</Label>
              <Input
                id={ids.mode}
                list={ids.modeList}
                maxLength={30}
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              />
              <datalist id={ids.modeList}>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.reference}>Reference (optional)</Label>
            <Input
              id={ids.reference}
              placeholder="Bill no., UPI ref, order id…"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.description}>Note (optional)</Label>
            <Textarea
              id={ids.description}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {entry ? 'Save changes' : 'Add entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
