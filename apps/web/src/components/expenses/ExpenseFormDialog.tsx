import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { logActivity } from '@/lib/activityLog'
import { PAYMENT_MODES, type Expense, type ExpenseCategory } from './types'

interface ExpenseFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editTarget: Expense | null
}

const today = () => new Date().toISOString().split('T')[0]

// Based on the highest EXP-N seen so far, not a row count — a COUNT-based number
// collides with an existing row the moment any expense has ever been deleted.
async function nextExpenseNumber(orgId: string) {
  const { data } = await supabase
    .from('expenses')
    .select('expense_no')
    .eq('organization_id', orgId)
    .not('expense_no', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200)

  let maxSeq = 0
  for (const row of data ?? []) {
    const match = row.expense_no?.match(/^EXP-(\d+)$/)
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10))
  }
  return `EXP-${maxSeq + 1}`
}

export function ExpenseFormDialog({ open, onOpenChange, editTarget }: ExpenseFormDialogProps) {
  const { org, user } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()
  const isEdit = !!editTarget

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [expenseDate, setExpenseDate] = useState(today())
  const [paymentMode, setPaymentMode] = useState<string>('Cash')
  const [status, setStatus] = useState<'paid' | 'unpaid'>('paid')
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState<'direct' | 'indirect'>('indirect')

  const { data: categories = [] } = useQuery({
    queryKey: ['expense_categories', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('organization_id', orgId!)
        .order('name')
      if (error) throw error
      return (data ?? []) as ExpenseCategory[]
    },
  })

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('id, name').eq('organization_id', orgId!).order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: nextExpenseNo } = useQuery({
    queryKey: ['next_expense_no', orgId],
    enabled: !!orgId && !isEdit && open,
    queryFn: async () => nextExpenseNumber(orgId!),
  })

  useEffect(() => {
    if (!open) return
    if (editTarget) {
      setDescription(editTarget.description)
      setAmount(String(editTarget.amount))
      setCategory(editTarget.category)
      setExpenseDate(editTarget.expense_date)
      setPaymentMode(editTarget.payment_mode)
      setStatus(editTarget.status)
      setSupplierId(editTarget.supplier_id ?? '')
      setNotes(editTarget.notes ?? '')
    } else {
      setDescription('')
      setAmount('')
      setCategory('')
      setExpenseDate(today())
      setPaymentMode('Cash')
      setStatus('paid')
      setSupplierId('')
      setNotes('')
    }
  }, [open, editTarget])

  useEffect(() => {
    if (!category && categories.length > 0 && !isEdit) {
      setCategory(categories[0].name)
    }
  }, [categories, category, isEdit])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount)
      if (!description.trim()) throw new Error('Expense name required')
      if (isNaN(amt) || amt <= 0) throw new Error('Enter a valid amount')
      if (!category) throw new Error('Select a category')

      const payload = {
        description: description.trim(),
        amount: amt,
        category,
        expense_type: categories.find((c) => c.name === category)?.type ?? 'indirect',
        expense_date: expenseDate,
        payment_mode: paymentMode,
        status,
        supplier_id: supplierId || null,
        notes: notes.trim() || null,
      }

      if (isEdit) {
        const { error } = await supabase.from('expenses').update(payload).eq('id', editTarget!.id).eq('organization_id', orgId!)
        if (error) throw error

        await logActivity({
          organizationId: orgId!,
          action: 'updated',
          entity: 'expense',
          entityId: editTarget!.id,
          metadata: payload,
        })
      } else {
        let expenseNo = nextExpenseNo ?? await nextExpenseNumber(orgId!)
        let insert = await supabase.from('expenses').insert({
          organization_id: orgId!,
          created_by: user!.id,
          expense_no: expenseNo,
          ...payload,
        }).select().single()

        // expense_no collided with a concurrently-created row (stale cached number) — refetch and retry.
        for (let attempt = 0; insert.error?.code === '23505' && attempt < 3; attempt++) {
          expenseNo = await nextExpenseNumber(orgId!)
          insert = await supabase.from('expenses').insert({
            organization_id: orgId!,
            created_by: user!.id,
            expense_no: expenseNo,
            ...payload,
          }).select().single()
        }
        if (insert.error) throw insert.error

        await logActivity({
          organizationId: orgId!,
          action: 'created',
          entity: 'expense',
          entityId: insert.data?.id,
          metadata: payload,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', orgId] })
      queryClient.invalidateQueries({ queryKey: ['activity_log', orgId] })
      queryClient.invalidateQueries({ queryKey: ['next_expense_no', orgId] })
      queryClient.invalidateQueries({ queryKey: ['expense_category_counts', orgId] })
      if (isEdit) {
        queryClient.invalidateQueries({ queryKey: ['expense-detail', orgId, editTarget!.id] })
      }
      toast.success(isEdit ? 'Expense updated' : 'Expense added')
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(isEdit ? 'Failed to update expense' : 'Failed to add expense', err.message),
  })

  const createCategoryMutation = useMutation({
    mutationFn: async () => {
      if (!newCategoryName.trim()) throw new Error('Category name required')
      const { data, error } = await supabase.from('expense_categories').insert({
        organization_id: orgId!,
        name: newCategoryName.trim(),
        type: newCategoryType,
      }).select().single()
      if (error) throw error
      return data as ExpenseCategory
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['expense_categories', orgId] })
      toast.success('Category created')
      setCategory(created.name)
      setNewCategoryName('')
      setNewCategoryType('indirect')
      setShowAddCategory(false)
    },
    onError: (err: Error) => toast.error('Failed to create category', err.message),
  })

  const selectedCategory = categories.find((c) => c.name === category)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Expense Name *</Label>
              <Input
                placeholder="e.g., Office Rent, Electricity Bill"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Expense No</Label>
              <Input value={isEdit ? editTarget!.expense_no ?? '—' : nextExpenseNo ?? '...'} disabled className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Expense Category</Label>
              <div className="flex items-center gap-1.5">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="" disabled>Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  title="Add new category"
                  onClick={() => setShowAddCategory(true)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-indigo-400 hover:border-indigo-500 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {selectedCategory && (
                <p className="text-[11px] text-muted-foreground capitalize">{selectedCategory.type} expense</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount (₹) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="flex items-center gap-2 h-9">
                <span className={cn('text-xs', status === 'unpaid' ? 'text-amber-300 font-medium' : 'text-muted-foreground')}>Unpaid</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={status === 'paid'}
                  onClick={() => setStatus(status === 'paid' ? 'unpaid' : 'paid')}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
                    status === 'paid' ? 'bg-indigo-600' : 'bg-zinc-600'
                  )}
                >
                  <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200', status === 'paid' ? 'translate-x-4' : 'translate-x-0')} />
                </button>
                <span className={cn('text-xs', status === 'paid' ? 'text-emerald-300 font-medium' : 'text-muted-foreground')}>Paid</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Paid To (Optional Supplier)</Label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">Link to a supplier if this is a credit expense</p>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea
              rows={2}
              placeholder="Additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : isEdit ? 'Save Changes' : 'Save Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {showAddCategory && (
      <Dialog
        open={showAddCategory}
        onOpenChange={(o) => {
          setShowAddCategory(o)
          if (!o) {
            setNewCategoryName('')
            setNewCategoryType('indirect')
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Expense Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category Name *</Label>
              <Input
                placeholder="e.g., Rent, Electricity, Freight"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category Type *</Label>
              <Select value={newCategoryType} onValueChange={(v) => setNewCategoryType(v as 'direct' | 'indirect')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="indirect">Indirect Expense — Operating costs (Rent, Salary, etc.)</SelectItem>
                  <SelectItem value="direct">Direct Expense — Costs tied directly to goods sold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddCategory(false); setNewCategoryName(''); setNewCategoryType('indirect') }}>Cancel</Button>
            <Button onClick={() => createCategoryMutation.mutate()} disabled={createCategoryMutation.isPending}>
              {createCategoryMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Creating...</> : 'Create Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </Dialog>
  )
}
