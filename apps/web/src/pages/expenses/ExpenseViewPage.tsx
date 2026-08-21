import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Printer, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatINR } from '@billscape/core'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { logActivity } from '@/lib/activityLog'
import { ExpenseFormDialog } from '@/components/expenses/ExpenseFormDialog'
import type { Expense } from '@/components/expenses/types'

export function ExpenseViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { org, role } = useAuth()
  const orgId = org?.id
  const queryClient = useQueryClient()
  const canManage = role === 'owner' || role === 'manager'

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const { data: expense, isLoading } = useQuery({
    queryKey: ['expense-detail', orgId, id],
    enabled: !!orgId && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, suppliers(name)')
        .eq('organization_id', orgId!)
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as Expense & { suppliers: { name: string } | null }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('expenses').delete().eq('id', id!).eq('organization_id', orgId!)
      if (error) throw error

      await logActivity({
        organizationId: orgId!,
        action: 'deleted',
        entity: 'expense',
        entityId: id!,
        metadata: { description: expense?.description, amount: expense?.amount },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', orgId] })
      toast.success('Expense deleted')
      navigate('/expenses')
    },
    onError: (err: Error) => toast.error('Failed to delete expense', err.message),
  })

  const toggleStatusMutation = useMutation({
    mutationFn: async () => {
      const nextStatus = expense!.status === 'paid' ? 'unpaid' : 'paid'
      const { error } = await supabase.from('expenses').update({ status: nextStatus }).eq('id', id!).eq('organization_id', orgId!)
      if (error) throw error
      return nextStatus
    },
    onSuccess: (nextStatus) => {
      queryClient.invalidateQueries({ queryKey: ['expenses', orgId] })
      queryClient.invalidateQueries({ queryKey: ['expense-detail', orgId, id] })
      toast.success(nextStatus === 'paid' ? 'Marked as paid' : 'Marked as unpaid')
    },
    onError: (err: Error) => toast.error('Failed to update status', err.message),
  })

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/expenses')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              {expense?.expense_no ?? 'Expense'}
              {expense && (
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${expense.status === 'paid' ? 'bg-indigo-500/15 text-indigo-300' : 'bg-amber-500/15 text-amber-300'}`}>
                  {expense.status}
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{expense?.description}</p>
          </div>
        </div>
        {expense && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" />Print
            </Button>
            {canManage && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />Edit
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5" />Delete
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !expense ? (
        <p className="text-sm text-muted-foreground">Expense not found.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">Amount</span>
              <p className="text-2xl font-bold text-red-400 mt-1">{formatINR(expense.amount)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">Date</span>
              <p className="text-lg font-semibold text-foreground mt-1">{formatDate(expense.expense_date)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">Payment Mode</span>
              <p className="text-lg font-semibold text-foreground mt-1">{expense.payment_mode}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-base font-semibold text-foreground mb-4">Expense Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Expense Number</span>
                <p className="font-mono text-foreground mt-0.5">{expense.expense_no ?? '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status</span>
                <p className="mt-0.5">
                  {canManage ? (
                    <button
                      type="button"
                      title={expense.status === 'paid' ? 'Click to mark as unpaid' : 'Click to mark as paid'}
                      onClick={() => toggleStatusMutation.mutate()}
                      disabled={toggleStatusMutation.isPending}
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize transition-colors cursor-pointer disabled:opacity-50 ${expense.status === 'paid' ? 'bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25' : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'}`}
                    >
                      {expense.status}
                    </button>
                  ) : (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${expense.status === 'paid' ? 'bg-indigo-500/15 text-indigo-300' : 'bg-amber-500/15 text-amber-300'}`}>
                      {expense.status}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Expense Name</span>
                <p className="text-foreground font-medium mt-0.5">{expense.description}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Supplier/Party</span>
                <p className="text-foreground mt-0.5">{expense.suppliers?.name ?? '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Category</span>
                <p className="text-foreground mt-0.5">{expense.category}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Created At</span>
                <p className="text-foreground mt-0.5">{formatDate(expense.created_at)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Expense Type</span>
                <p className="mt-0.5">
                  <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800/50 px-2 py-0.5 text-xs font-medium capitalize text-zinc-300">
                    {expense.expense_type} Expense
                  </span>
                </p>
              </div>
              {expense.notes && (
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground">Notes</span>
                  <p className="text-foreground mt-0.5">{expense.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Expense?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete this expense record. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              {deleteMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Deleting...</> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {expense && (
        <ExpenseFormDialog open={editOpen} onOpenChange={setEditOpen} editTarget={expense} />
      )}
    </div>
  )
}
